"""
Vectorised bootstrap Monte Carlo simulation.

Methodology
-----------
For each simulation:
    1. Draw `n_trades` samples WITH replacement from the historical P&L series.
    2. Apply each sampled trade to build a synthetic equity path starting at
       `initial_capital`.
    3. Repeat `n_simulations` times.

Because steps 1-2 are expressed as NumPy array operations, all simulations
run in a single vectorised pass — no Python loops over simulations.

Memory note
-----------
The main working array has shape (n_simulations, n_trades) of float64.
At 10 000 sims × 1 000 trades that is 80 MB, which is perfectly fine.
For very large trade counts (> 5 000) we cap effective simulations to keep
peak RAM below ≈ 400 MB.
"""
from __future__ import annotations

from typing import Any, Dict

import numpy as np

# Maximum elements in the simulation matrix to guard against OOM.
_MAX_ELEMENTS = 50_000_000

# Downsample fan-chart paths to at most this many x-axis points.
_MAX_PATH_POINTS = 300


def run_monte_carlo(
    pnl_series: np.ndarray,
    initial_capital: float,
    n_simulations: int = 10_000,
    n_sample_paths: int = 500,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Run bootstrap Monte Carlo and return distribution statistics + fan-chart data.

    Args:
        pnl_series:      Historical per-trade P&L array (1-D float64).
        initial_capital: Starting portfolio value for every simulation.
        n_simulations:   Number of independent Monte Carlo runs.
        n_sample_paths:  How many raw paths to include in the fan-chart payload.
        seed:            Random seed for reproducibility.

    Returns:
        Dictionary with keys matching MCDistribution + MCPaths Pydantic models.
    """
    n_trades = len(pnl_series)
    if n_trades == 0:
        raise ValueError("pnl_series must not be empty.")

    # Respect memory cap
    effective_sims = min(n_simulations, _MAX_ELEMENTS // max(n_trades, 1))
    rng = np.random.default_rng(seed)

    # ── Vectorised bootstrap ──────────────────────────────────────────────────────
    # Shape: (effective_sims, n_trades)
    indices = rng.integers(0, n_trades, size=(effective_sims, n_trades))
    resampled: np.ndarray = pnl_series[indices]

    # Cumulative equity paths: shape (effective_sims, n_trades)
    # paths[i, j] = portfolio value after the (j+1)-th trade in simulation i
    paths: np.ndarray = initial_capital + np.cumsum(resampled, axis=1)

    # ── Final-equity distribution ─────────────────────────────────────────────────
    final_equities: np.ndarray = paths[:, -1]

    # ── Per-simulation maximum drawdown ──────────────────────────────────────────
    running_max: np.ndarray = np.maximum.accumulate(paths, axis=1)
    # drawdown ratio — negative values represent losses from the running peak
    drawdowns: np.ndarray = (paths - running_max) / running_max
    min_drawdowns: np.ndarray = np.min(drawdowns, axis=1)

    # ── Summary statistics ────────────────────────────────────────────────────────
    mean_final = float(np.mean(final_equities))
    median_final = float(np.median(final_equities))
    p5 = float(np.percentile(final_equities, 5))
    p95 = float(np.percentile(final_equities, 95))
    prob_profit = float(np.mean(final_equities > initial_capital))
    prob_large_drawdown = float(np.mean(min_drawdowns < -0.50))

    # ── Downsample path axis for API payload size ─────────────────────────────────
    if n_trades > _MAX_PATH_POINTS:
        step = max(1, n_trades // _MAX_PATH_POINTS)
        paths_ds: np.ndarray = paths[:, ::step]
    else:
        paths_ds = paths

    # ── Percentile bands along the path axis ──────────────────────────────────────
    median_path = np.percentile(paths_ds, 50, axis=0).tolist()
    p5_path = np.percentile(paths_ds, 5, axis=0).tolist()
    p25_path = np.percentile(paths_ds, 25, axis=0).tolist()
    p75_path = np.percentile(paths_ds, 75, axis=0).tolist()
    p95_path = np.percentile(paths_ds, 95, axis=0).tolist()

    # ── Sparse sample paths for fan-chart rendering ───────────────────────────────
    n_out = min(n_sample_paths, effective_sims)
    sample_idx = rng.choice(effective_sims, size=n_out, replace=False)
    sample_paths = paths_ds[sample_idx, :].tolist()

    return {
        "final_equities": final_equities.tolist(),
        "mean_final": mean_final,
        "median_final": median_final,
        "p5": p5,
        "p95": p95,
        "prob_profit": prob_profit,
        "prob_large_drawdown": prob_large_drawdown,
        "sample_paths": sample_paths,
        "median_path": median_path,
        "p5_path": p5_path,
        "p25_path": p25_path,
        "p75_path": p75_path,
        "p95_path": p95_path,
    }
