"""
Core analytics computation for a sequence of trade P&L values.

All functions operate on NumPy arrays for efficiency.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np
from scipy import stats


def compute_metrics(pnl_series: np.ndarray, initial_capital: float) -> Dict[str, Any]:
    """
    Compute standard performance metrics from a per-trade P&L array.

    Args:
        pnl_series:      1-D array of per-trade P&L in dollar terms.
        initial_capital: Starting portfolio value used to build the equity curve.

    Returns:
        Dictionary compatible with the Metrics Pydantic model.
    """
    n = int(len(pnl_series))
    if n == 0:
        raise ValueError("pnl_series is empty – cannot compute metrics.")

    wins = pnl_series[pnl_series > 0]

    # ── Equity curve ────────────────────────────────────────────────────────────
    equity: np.ndarray = initial_capital + np.cumsum(pnl_series)

    # ── Max drawdown ─────────────────────────────────────────────────────────────
    # Peak-to-trough decline expressed as a fraction of the running peak.
    running_max: np.ndarray = np.maximum.accumulate(equity)
    drawdown: np.ndarray = (equity - running_max) / running_max
    max_drawdown = float(np.min(drawdown))

    # ── Per-trade Sharpe ratio ────────────────────────────────────────────────────
    # Annualisation is not applied; this is the signal-to-noise ratio per trade.
    mean_pnl = float(np.mean(pnl_series))
    std_pnl = float(np.std(pnl_series, ddof=1)) if n > 1 else 0.0
    sharpe = mean_pnl / std_pnl if std_pnl > 0.0 else 0.0

    # ── Distribution shape ────────────────────────────────────────────────────────
    skewness = float(stats.skew(pnl_series)) if n > 2 else 0.0

    return {
        "total_trades": n,
        "win_rate": float(len(wins) / n),
        "mean_pnl": mean_pnl,
        "median_pnl": float(np.median(pnl_series)),
        "std_pnl": std_pnl,
        "max_drawdown": max_drawdown,
        "sharpe_ratio": float(sharpe),
        "skewness": skewness,
        "total_pnl": float(np.sum(pnl_series)),
    }


def compute_equity_curve(
    pnl_series: np.ndarray,
    initial_capital: float,
    times: List[str],
) -> Tuple[List[str], List[float]]:
    """
    Build the cumulative equity curve aligned to trade exit timestamps.

    Args:
        pnl_series:      Per-trade P&L values.
        initial_capital: Starting portfolio value.
        times:           ISO-8601 exit timestamps for each trade.

    Returns:
        (timestamps, equity_values) as Python lists.
    """
    equity = (initial_capital + np.cumsum(pnl_series)).tolist()
    return times, equity
