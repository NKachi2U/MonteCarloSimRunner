"""
Monte Carlo Analysis API — FastAPI backend.

Endpoints
---------
GET  /health          Health check.
POST /upload          Parse a QuantConnect trades CSV → round-trip Trade list.
POST /analyze         Run analytics + Monte Carlo on a parsed trade list.
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
    description="Parses QuantConnect trade exports and runs bootstrap Monte Carlo simulations.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Column normalisation ──────────────────────────────────────────────────────────
# Maps canonical column names to the aliases that QuantConnect (and similar
# platforms) may use in CSV exports.
_COLUMN_ALIASES: Dict[str, List[str]] = {
    "time":     ["time", "date", "datetime", "timestamp", "entry time", "order time"],
    "symbol":   ["symbol", "ticker", "instrument", "asset"],
    "price":    ["price", "fill price", "execution price", "avg price", "avgprice"],
    "quantity": ["quantity", "qty", "shares", "size", "amount"],
    "type":     ["type", "order type", "ordertype", "side"],
    "status":   ["status", "fill status", "state"],
    "value":    ["value", "notional", "total value", "fill value", "cost"],
    "tag":      ["tag", "comment", "note", "label", "description"],
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


def _parse_round_trips(df: pd.DataFrame) -> List[Trade]:
    """
    Match individual order fills into round-trip trades using FIFO queuing.

    QuantConnect exports every order fill as a separate row.  A long trade
    consists of:
        Entry row  — positive Quantity (buy)
        Exit  row  — negative Quantity (sell, usually Tag = "Liquidated")

    P&L per round trip = (exit_price − entry_price) × abs(quantity)

    Args:
        df: Normalised DataFrame (column names already canonical).

    Returns:
        List of Trade objects with computed P&L.

    Raises:
        ValueError: If required columns are missing.
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

    # FIFO queue: symbol → list of open-position dicts
    open_positions: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    trades: List[Trade] = []

    for _, row in df.iterrows():
        symbol = str(row["symbol"]).strip()
        qty    = float(row["quantity"])
        price  = float(row["price"])
        ts     = pd.Timestamp(row["time"])

        if qty > 0:
            # Opening a long position — push to FIFO queue
            open_positions[symbol].append(
                {"entry_time": ts, "entry_price": price, "quantity": qty}
            )

        elif qty < 0 and open_positions[symbol]:
            # Closing a long position — pop the earliest open entry (FIFO)
            entry   = open_positions[symbol].pop(0)
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


# ── Routes ─────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> Dict[str, str]:
    """Simple liveness probe."""
    return {"status": "ok"}


@app.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)) -> UploadResponse:
    """
    Accept a QuantConnect trades CSV and return parsed round-trip trades.

    The endpoint is tolerant of different column naming conventions used by
    QuantConnect and compatible platforms.
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
        trades = _parse_round_trips(df)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not trades:
        raise HTTPException(
            status_code=422,
            detail=(
                "No valid round-trip trades could be extracted.  "
                "Ensure the CSV contains matching buy and sell rows for at least one symbol."
            ),
        )

    symbols = sorted({t.symbol for t in trades})
    logger.info(
        "Extracted %d round-trip trades across symbols: %s", len(trades), symbols
    )

    return UploadResponse(trades=trades, total_trades=len(trades), symbols=symbols)


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalysisRequest) -> AnalysisResponse:
    """
    Run full analytics and Monte Carlo simulation on a parsed trade list.

    Returns core metrics, cumulative equity curve, position notional series,
    Monte Carlo final-equity distribution, and fan-chart path data.
    """
    if not request.trades:
        raise HTTPException(status_code=400, detail="Trade list is empty.")

    pnl_array   = np.array([t.pnl for t in request.trades], dtype=np.float64)
    exit_times  = [t.exit_time for t in request.trades]
    # Entry notional per trade (used for the Position Notional chart)
    entry_notionals = [abs(t.entry_price * t.quantity) for t in request.trades]

    # ── Core metrics ────────────────────────────────────────────────────────────
    metrics_dict = compute_metrics(pnl_array, request.initial_capital)
    metrics = Metrics(**metrics_dict)

    # ── Cumulative equity curve ──────────────────────────────────────────────────
    times, equity = compute_equity_curve(pnl_array, request.initial_capital, exit_times)
    equity_curve  = EquityCurve(times=times, equity=equity)

    # ── Position notional over time ──────────────────────────────────────────────
    notional_data = NotionalData(times=exit_times, notionals=entry_notionals)

    # ── Monte Carlo simulation ───────────────────────────────────────────────────
    logger.info(
        "Starting MC: %d simulations, %d trades, initial_capital=%.0f",
        request.n_simulations,
        len(request.trades),
        request.initial_capital,
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
