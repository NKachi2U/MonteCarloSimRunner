"""
Pydantic data models for the Monte Carlo Analysis API.
"""
from pydantic import BaseModel
from typing import List


class Trade(BaseModel):
    """A single round-trip trade (entry fill -> exit fill)."""
    symbol: str
    entry_time: str
    exit_time: str
    quantity: float
    entry_price: float
    exit_price: float
    pnl: float


class UploadResponse(BaseModel):
    trades: List[Trade]
    total_trades: int
    symbols: List[str]


class AnalysisRequest(BaseModel):
    trades: List[Trade]
    initial_capital: float = 1_000_000.0
    n_simulations: int = 10_000
    n_sample_paths: int = 500


class Metrics(BaseModel):
    total_trades: int
    win_rate: float
    mean_pnl: float
    median_pnl: float
    std_pnl: float
    max_drawdown: float        # fraction, e.g. -0.25 means -25%
    sharpe_ratio: float        # per-trade Sharpe (mean/std of PnL)
    skewness: float
    total_pnl: float


class MCDistribution(BaseModel):
    """Summary statistics of the Monte Carlo final-equity distribution."""
    final_equities: List[float]    # sampled final portfolio values
    mean_final: float
    median_final: float
    p5: float
    p95: float
    prob_profit: float           # fraction of sims that end above initial_capital
    prob_large_drawdown: float   # fraction of sims with max drawdown > 50 %


class MCPaths(BaseModel):
    """Fan-chart data: percentile bands + sparse sample paths."""
    sample_paths: List[List[float]]
    median_path: List[float]
    p5_path: List[float]
    p25_path: List[float]
    p75_path: List[float]
    p95_path: List[float]


class EquityCurve(BaseModel):
    times: List[str]
    equity: List[float]


class NotionalData(BaseModel):
    times: List[str]
    notionals: List[float]


class AnalysisResponse(BaseModel):
    metrics: Metrics
    mc_distribution: MCDistribution
    mc_paths: MCPaths
    equity_curve: EquityCurve
    pnl_series: List[float]
    notional_data: NotionalData
