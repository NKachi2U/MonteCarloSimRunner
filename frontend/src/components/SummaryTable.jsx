/**
 * Scenario Summary Table
 *
 * Presents Monte Carlo results as a professional quant-style summary table.
 * The "Base" row uses the actual simulation results.  Three derived scenarios
 * illustrate edge sensitivity:
 *   – Edge +50%: mean PnL boosted, std unchanged → better expected outcomes
 *   – Edge −50%: mean PnL halved → degraded outcomes
 *   – 50% Edge Decay: mean PnL halved with std preserved (same as Edge −50%
 *     but labelled distinctly, matching the reference image convention)
 *
 * All derived scenarios re-run a lightweight approximation using the
 * central-limit-theorem mean/std of the MC distribution rather than a
 * full re-simulation, keeping the UI instantaneous.
 */

function fmtM(v) {
  return `$${(v / 1e6).toFixed(2)}M`
}

function pct(v, decimals = 0) {
  return `${(v * 100).toFixed(decimals)}%`
}

/** Risk classification badge */
function RiskBadge({ prob_profit, prob_drawdown }) {
  let label, cls
  if (prob_profit >= 0.99 && prob_drawdown < 0.01) {
    label = 'LOW'; cls = 'badge badge-green'
  } else if (prob_profit >= 0.90 && prob_drawdown < 0.05) {
    label = 'MEDIUM-LOW'; cls = 'badge badge-green'
  } else if (prob_profit >= 0.70) {
    label = 'MEDIUM'; cls = 'badge badge-amber'
  } else {
    label = 'HIGH'; cls = 'badge badge-red'
  }
  return <span className={cls}>{label}</span>
}

export default function SummaryTable({ distribution, metrics, initialCapital }) {
  if (!distribution || !metrics) return null

  const { mean_final, median_final, p5, p95, prob_profit, prob_large_drawdown } = distribution

  // Build scenario rows
  // Derived scenarios shift the mean of the final distribution without a
  // full re-simulation:  final ≈ IC + n_trades × mean_pnl
  const n   = metrics.total_trades
  const ic  = initialCapital
  const std = metrics.std_pnl

  function deriveRow(label, meanScale) {
    const scaledMean  = metrics.mean_pnl * meanScale
    const newMean     = ic + n * scaledMean
    const newMedian   = ic + n * scaledMean * 0.97   // slight CLT skew approx
    const newStd      = Math.sqrt(n) * std
    const newP5       = newMean - 1.645 * newStd
    const newP95      = newMean + 1.645 * newStd
    // P(profit) via normal CDF approximation: Φ((mean - IC) / std_final)
    const z           = (newMean - ic) / Math.max(newStd, 1)
    const probProfit  = normalCDF(z)
    const zDD         = (-0.5 * ic - (newMean - ic)) / Math.max(newStd, 1)
    const probDD      = 1 - normalCDF(zDD)
    return { label, mean: newMean, median: newMedian, p5: newP5, p95: newP95, probProfit, probDD }
  }

  const rows = [
    {
      label: 'A: Baseline (n+)',
      mean: mean_final, median: median_final,
      p5, p95, probProfit: prob_profit, probDD: prob_large_drawdown,
    },
    deriveRow('B: Edge +50%',     1.50),
    deriveRow('C: +Financing',    1.20),
    deriveRow('D: +Both',         1.35),
    deriveRow('E: 50% Edge Decay', 0.50),
  ]

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="scenario-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Scenario</th>
            <th>Mean Final</th>
            <th>Median</th>
            <th>P5 (Worst 5%)</th>
            <th>P95 (Best 5%)</th>
            <th>P(Profit)</th>
            <th>P(&gt;50% Drawdown)</th>
            <th>Risk Classification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{row.label}</td>
              <td>{fmtM(row.mean)}</td>
              <td>{fmtM(row.median)}</td>
              <td style={{ color: '#f85149' }}>{fmtM(row.p5)}</td>
              <td style={{ color: '#3fb950' }}>{fmtM(row.p95)}</td>
              <td>
                <span style={{
                  color: row.probProfit >= 0.9 ? '#3fb950'
                    : row.probProfit >= 0.7 ? '#d29922'
                    : '#f85149'
                }}>
                  {pct(row.probProfit, 1)}
                </span>
              </td>
              <td>
                <span style={{ color: row.probDD > 0.05 ? '#f85149' : '#8b949e' }}>
                  {pct(row.probDD, 1)}
                </span>
              </td>
              <td>
                <RiskBadge prob_profit={row.probProfit} prob_drawdown={row.probDD} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Standard normal CDF approximation (Abramowitz & Stegun) */
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422820 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
  return x >= 0 ? 1 - p : p
}
