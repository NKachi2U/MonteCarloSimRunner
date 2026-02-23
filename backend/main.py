"""
Monte Carlo Analysis API — FastAPI backend.

Endpoints
---------
GET  /health          Health check.
POST /upload          Parse a trades CSV → round-trip Trade list.
POST /analyze         Run analytics + Monte Carlo on a parsed trade list.

Supported CSV formats
---------------------
1. Order-fill format (original QuantConnect):
   One row per order fill, positive qty = buy, negative qty = sell.
   Columns: Time, Symbol, Price, Quantity, ...
   Trades are reconstructed via FIFO matching.

2. Trade summary format (QuantConnect / other platforms):
   One row per completed round-trip trade, P&L already computed.
   Columns: Time, Symbols, Entry Price, Exit Price, Quantity, P&L, ...
"""
from __future__ import annotations

import io
import logging
from collections import defaultdict
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from analytics import compute_equity_curve, compute_metrics
from models import (
    AnalysisRequest,
    AnalysisResponse,
    EquityCurve,
    MCDistribution,
    MCPaths,
    Metrics,
    NotionalData,
    Trade,
    UploadResponse,
)
from monte_carlo import run_monte_carlo

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Monte Carlo Analysis API",
    description="Parses trade exports and runs bootstrap Monte Carlo simulations.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Column normalisation ──────────────────────────────────────────────────────────
# Two sets of aliases cover both CSV formats.
_COLUMN_ALIASES: Dict[str, List[str]] = {
    # Entry timestamp (both formats use "time"; summary may also say "entry time")
    "time": [
        "time", "date", "datetime", "timestamp",
        "entry time", "entry_time", "order time", "open time",
    ],
    # Exit timestamp (trade-summary format only)
    "exit_time": [
        "exit time", "exit_time", "close time", "close_time",
        "exit date", "close date",
    ],
    # Symbol — note "symbols" (plural) used by some platforms
    "symbol": [
        "symbol", "symbols", "ticker", "instrument", "asset",
    ],
    # Single fill price (order-fill format)
    "price": [
        "price", "fill price", "execution price",
        "avg price", "avgprice", "fill_price",
    ],
    # Entry price (trade-summary format)
    "entry_price": [
        "entry price", "entry_price", "open price", "open_price",
        "avg entry", "avg entry price", "entry",
    ],
    # Exit price (trade-summary format)
    "exit_price": [
        "exit price", "exit_price", "close price", "close_price",
        "avg exit", "avg exit price", "exit",
    ],
    # Position size
    "quantity": [
        "quantity", "qty", "shares", "size", "amount", "contracts",
    ],
    # Pre-computed P&L (trade-summary format)
    "pnl": [
        "p&l", "pnl", "profit", "profit/loss", "net profit",
        "realized pnl", "net p&l", "gain/loss", "return",
    ],
    # Trade direction (trade-summary format)
    "direction": [
        "direction", "side", "trade direction",
    ],
    # Order-fill format extras (kept for backward compat)
    "type":   ["type", "order type", "ordertype"],
    "status": ["status", "fill status", "state"],
    "value":  ["value", "notional", "total value", "fill value", "cost"],
    "tag":    ["tag", "comment", "note", "label", "description"],
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename DataFrame columns to canonical lowercase names via alias lookup."""
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    rename_map: Dict[str, str] = {}
    for canonical, aliases in _COLUMN_ALIASES.items():
        for col in df.columns:
            if col in aliases and canonical not in rename_map.values():
                rename_map[col] = canonical
                break
    return df.rename(columns=rename_map)


def _is_summary_format(df: pd.DataFrame) -> bool:
    """
    Return True when the dataframe looks like a trade-summary CSV
    (one row per completed trade with separate entry/exit price columns).
    """
    return "entry_price" in df.columns and "exit_price" in df.columns


# ── Parser A: trade-summary format ───────────────────────────────────────────────

def _parse_trade_summary(df: pd.DataFrame) -> List[Trade]:
    """
    Parse a trade-summary CSV where every row is a completed round-trip.

    Expected canonical columns after normalisation:
        time          — entry timestamp
        exit_time     — exit timestamp  (optional; falls back to entry time)
        symbol        — instrument name
        entry_price   — fill price at entry
        exit_price    — fill price at exit
        quantity      — position size (absolute value used)
        pnl           — realised P&L  (optional; computed if absent)
        direction     — "long" / "short"  (optional; assumed long if absent)
    """
    required = {"time", "symbol", "entry_price", "exit_price", "quantity"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"CSV is missing required columns after normalisation: {missing}. "
            f"Found columns: {list(df.columns)}"
        )

    df = df.copy()
    df["time"] = pd.to_datetime(df["time"], utc=True, errors="coerce")

    if "exit_time" in df.columns:
        df["exit_time"] = pd.to_datetime(df["exit_time"], utc=True, errors="coerce")
    else:
        df["exit_time"] = df["time"]

    trades: List[Trade] = []

    for _, row in df.iterrows():
        symbol      = str(row["symbol"]).strip()
        qty         = abs(float(row["quantity"]))
        entry_price = float(row["entry_price"])
        exit_price  = float(row["exit_price"])
        entry_ts    = row["time"]
        exit_ts     = row["exit_time"]

        # Use pre-computed P&L when available — it already accounts for
        # direction, fees, and any platform-specific adjustments.
        if "pnl" in df.columns and pd.notna(row["pnl"]):
            pnl = float(row["pnl"])
        else:
            # Fall back to computing from prices
            direction = str(row.get("direction", "long")).strip().lower() \
                if "direction" in df.columns else "long"
            if direction in ("short", "sell", "s"):
                pnl = (entry_price - exit_price) * qty
            else:
                pnl = (exit_price - entry_price) * qty

        trades.append(
            Trade(
                symbol=symbol,
                entry_time=pd.Timestamp(entry_ts).isoformat(),
                exit_time=pd.Timestamp(exit_ts).isoformat(),
                quantity=qty,
                entry_price=entry_price,
                exit_price=exit_price,
                pnl=round(pnl, 4),
            )
        )

    return trades


# ── Parser B: order-fill format ───────────────────────────────────────────────────

def _parse_order_fills(df: pd.DataFrame) -> List[Trade]:
    """
    Match individual order fills into round-trip trades using FIFO queuing.

    QuantConnect exports every fill as a separate row:
        Entry row — positive Quantity (buy)
        Exit  row — negative Quantity (sell, usually Tag = "Liquidated")

    P&L = (exit_price − entry_price) × abs(quantity)
    """
    required = {"time", "symbol", "price", "quantity"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(
            f"CSV is missing required columns after normalisation: {missing}. "
            f"Found columns: {list(df.columns)}"
        )

    df["time"] = pd.to_datetime(df["time"], utc=True)
    df = df.sort_values("time").reset_index(drop=True)

    open_positions: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    trades: List[Trade] = []

    for _, row in df.iterrows():
        symbol = str(row["symbol"]).strip()
        qty    = float(row["quantity"])
        price  = float(row["price"])
        ts     = pd.Timestamp(row["time"])

        if qty > 0:
            open_positions[symbol].append(
                {"entry_time": ts, "entry_price": price, "quantity": qty}
            )
        elif qty < 0 and open_positions[symbol]:
            entry    = open_positions[symbol].pop(0)
            exit_qty = abs(qty)
            pnl      = (price - entry["entry_price"]) * exit_qty
            trades.append(
                Trade(
                    symbol=symbol,
                    entry_time=entry["entry_time"].isoformat(),
                    exit_time=ts.isoformat(),
                    quantity=exit_qty,
                    entry_price=entry["entry_price"],
                    exit_price=price,
                    pnl=round(pnl, 4),
                )
            )

    return trades


# ── Routes ────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> Dict[str, str]:
    """Simple liveness probe."""
    return {"status": "ok"}


@app.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)) -> UploadResponse:
    """
    Accept a trades CSV and return parsed round-trip trades.

    Auto-detects whether the file is a trade-summary (one row per trade)
    or an order-fill export (one row per fill, requires FIFO matching).
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    raw = await file.read()

    try:
        df = pd.read_csv(io.StringIO(raw.decode("utf-8")))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {exc}")

    df = _normalize_columns(df)
    logger.info("CSV parsed — columns detected: %s", df.columns.tolist())

    try:
        if _is_summary_format(df):
            logger.info("Detected trade-summary format.")
            trades = _parse_trade_summary(df)
        else:
            logger.info("Detected order-fill format.")
            trades = _parse_order_fills(df)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not trades:
        raise HTTPException(
            status_code=422,
            detail="No valid trades could be extracted from this CSV.",
        )

    symbols = sorted({t.symbol for t in trades})
    logger.info("Extracted %d trades across symbols: %s", len(trades), symbols)

    return UploadResponse(trades=trades, total_trades=len(trades), symbols=symbols)


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalysisRequest) -> AnalysisResponse:
    """
    Run full analytics and Monte Carlo simulation on a parsed trade list.
    """
    if not request.trades:
        raise HTTPException(status_code=400, detail="Trade list is empty.")

    pnl_array       = np.array([t.pnl for t in request.trades], dtype=np.float64)
    exit_times      = [t.exit_time for t in request.trades]
    entry_notionals = [abs(t.entry_price * t.quantity) for t in request.trades]

    metrics_dict = compute_metrics(pnl_array, request.initial_capital)
    metrics      = Metrics(**metrics_dict)

    times, equity = compute_equity_curve(pnl_array, request.initial_capital, exit_times)
    equity_curve  = EquityCurve(times=times, equity=equity)

    notional_data = NotionalData(times=exit_times, notionals=entry_notionals)

    logger.info(
        "Starting MC: %d simulations, %d trades, initial_capital=%.0f",
        request.n_simulations, len(request.trades), request.initial_capital,
    )

    mc = run_monte_carlo(
        pnl_series=pnl_array,
        initial_capital=request.initial_capital,
        n_simulations=request.n_simulations,
        n_sample_paths=request.n_sample_paths,
    )

    mc_distribution = MCDistribution(
        final_equities=mc["final_equities"],
        mean_final=mc["mean_final"],
        median_final=mc["median_final"],
        p5=mc["p5"],
        p95=mc["p95"],
        prob_profit=mc["prob_profit"],
        prob_large_drawdown=mc["prob_large_drawdown"],
    )

    mc_paths = MCPaths(
        sample_paths=mc["sample_paths"],
        median_path=mc["median_path"],
        p5_path=mc["p5_path"],
        p25_path=mc["p25_path"],
        p75_path=mc["p75_path"],
        p95_path=mc["p95_path"],
    )

    logger.info("Analysis complete.")

    return AnalysisResponse(
        metrics=metrics,
        mc_distribution=mc_distribution,
        mc_paths=mc_paths,
        equity_curve=equity_curve,
        pnl_series=pnl_array.tolist(),
        notional_data=notional_data,
    )
