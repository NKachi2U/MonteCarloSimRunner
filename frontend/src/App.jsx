import { useState } from 'react'
import Upload from './components/Upload.jsx'
import MCDistributionChart from './components/MCDistributionChart.jsx'
import DistributionChart from './components/DistributionChart.jsx'
import EquityChart from './components/EquityChart.jsx'
import FanChart from './components/FanChart.jsx'
import SummaryTable from './components/SummaryTable.jsx'
import NotionalChart from './components/NotionalChart.jsx'
import { uploadFile, runAnalysis } from './api.js'

/** Format a dollar amount compactly: $1.23M, $456k, $123 */
function fmtDollar(v) {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

function MetricCard({ label, value, color }) {
  return (
    <div className={`metric-card ${color || ''}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}

export default function App() {
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState(null)
  const [results,        setResults]        = useState(null)
  const [initialCapital, setInitialCapital] = useState(1_000_000)

  async function handleUpload(file) {
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      // 1. Parse CSV on the backend
      const uploadData = await uploadFile(file)

      // 2. Run analytics + Monte Carlo
      const analysisData = await runAnalysis({
        trades:          uploadData.trades,
        initial_capital: initialCapital,
        n_simulations:   10_000,
        n_sample_paths:  500,
      })

      setResults(analysisData)
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const m = results?.metrics

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="app-header">
        <h1>Monte Carlo Portfolio Analyser</h1>
        <p>Upload a QuantConnect trade CSV · statistical analysis · 10 000 bootstrap simulations</p>
      </header>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="upload-section">
        <Upload onUpload={handleUpload} loading={loading} />

        <div className="capital-input-card">
          <label>Initial Capital ($)</label>
          <input
            type="number"
            value={initialCapital}
            min={1000}
            step={10000}
            onChange={e => setInitialCapital(Number(e.target.value))}
            disabled={loading}
          />
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="error-banner">
          <span style={{ fontSize: '1.1rem' }}>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="loading-wrapper">
          <div className="spinner" />
          <p>Running 10 000 Monte Carlo simulations…</p>
        </div>
      )}

      {/* ── Dashboard ──────────────────────────────────────────────────────── */}
      {results && !loading && (
        <div className="dashboard">

          {/* Metrics strip */}
          <div className="metrics-strip">
            <MetricCard label="Total Trades"  value={m.total_trades} />
            <MetricCard
              label="Win Rate"
              value={`${(m.win_rate * 100).toFixed(1)}%`}
              color={m.win_rate >= 0.5 ? 'green' : 'amber'}
            />
            <MetricCard
              label="Mean PnL"
              value={fmtDollar(m.mean_pnl)}
              color={m.mean_pnl >= 0 ? 'green' : 'red'}
            />
            <MetricCard
              label="Median PnL"
              value={fmtDollar(m.median_pnl)}
              color={m.median_pnl >= 0 ? 'green' : 'red'}
            />
            <MetricCard
              label="Std Dev PnL"
              value={fmtDollar(m.std_pnl)}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${(m.max_drawdown * 100).toFixed(1)}%`}
              color="red"
            />
            <MetricCard
              label="Sharpe (per trade)"
              value={m.sharpe_ratio.toFixed(3)}
              color={m.sharpe_ratio >= 0 ? 'green' : 'red'}
            />
            <MetricCard
              label="Skewness"
              value={m.skewness.toFixed(2)}
              color={m.skewness >= 0 ? 'green' : 'amber'}
            />
            <MetricCard
              label="Total PnL"
              value={fmtDollar(m.total_pnl)}
              color={m.total_pnl >= 0 ? 'green' : 'red'}
            />
          </div>

          {/* Monte Carlo Final Distribution — full width */}
          <div className="chart-card">
            <h3>
              Monte Carlo Final Portfolio Distribution (10 000 Simulations,&nbsp;
              {m.total_trades} Trades Each)
            </h3>
            <MCDistributionChart
              data={results.mc_distribution}
              initialCapital={initialCapital}
            />
          </div>

          {/* Row: Notional over time + Trade PnL Distribution */}
          <div className="chart-row">
            <div className="chart-card">
              <h3>Position Notional Over Time</h3>
              <NotionalChart data={results.notional_data} />
            </div>
            <div className="chart-card">
              <h3>
                Trade PnL Distribution (n={m.total_trades},&nbsp;
                Win Rate={`${(m.win_rate * 100).toFixed(1)}%`})
              </h3>
              <DistributionChart pnlSeries={results.pnl_series} metrics={m} />
            </div>
          </div>

          {/* Row: Cumulative Equity Curve + MC Fan Chart */}
          <div className="chart-row">
            <div className="chart-card">
              <h3>Cumulative PnL Curve</h3>
              <EquityChart data={results.equity_curve} initialCapital={initialCapital} />
            </div>
            <div className="chart-card">
              <h3>Monte Carlo Path Fan (500 Paths)</h3>
              <FanChart data={results.mc_paths} initialCapital={initialCapital} />
            </div>
          </div>

          {/* Scenario summary — full width */}
          <div className="chart-card">
            <h3>Scenario Summary — Monte Carlo Results</h3>
            <SummaryTable
              distribution={results.mc_distribution}
              metrics={m}
              initialCapital={initialCapital}
            />
          </div>

        </div>
      )}
    </div>
  )
}
