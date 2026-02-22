/**
 * Trade PnL Distribution
 *
 * Histogram of per-trade P&L with vertical reference lines:
 *  - Mean PnL  (blue)
 *  - Median PnL (green)
 *  - Breakeven at $0 (dashed white)
 */
import Plot from '../Plot.jsx'

const DARK_BASE = {
  paper_bgcolor: '#161b22',
  plot_bgcolor:  '#0d1117',
  font:   { color: '#e6edf3', family: 'Inter, system-ui, sans-serif', size: 12 },
  legend: { bgcolor: 'rgba(0,0,0,0)', borderwidth: 0, x: 0.72, y: 0.97 },
  margin: { l: 60, r: 20, t: 16, b: 60 },
}

export default function DistributionChart({ pnlSeries, metrics }) {
  if (!pnlSeries || !metrics) return null

  const { mean_pnl, median_pnl } = metrics

  const histTrace = {
    x:           pnlSeries,
    type:        'histogram',
    name:        'Trade PnL',
    nbinsx:      60,
    showlegend:  false,
    marker:      { color: 'rgba(63,185,80,0.7)', line: { width: 0 } },
  }

  const shapes = [
    // Breakeven
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: 0, x1: 0, y0: 0, y1: 1,
      line: { color: '#ffffff', width: 1.5, dash: 'dash' },
    },
    // Mean
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: mean_pnl, x1: mean_pnl, y0: 0, y1: 1,
      line: { color: '#58a6ff', width: 1.5, dash: 'dot' },
    },
    // Median
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: median_pnl, x1: median_pnl, y0: 0, y1: 1,
      line: { color: '#d29922', width: 1.5, dash: 'dot' },
    },
  ]

  // Legend-only traces — rendered in the legend but not on the chart axes.
  // This avoids polluting the y-axis range with phantom points at y=0.
  const legendTraces = [
    {
      x: [mean_pnl],   y: [null], mode: 'markers', type: 'scatter',
      name: `Mean $${mean_pnl.toFixed(0)}`,
      marker: { color: '#58a6ff', size: 9, symbol: 'line-ew-open', line: { color: '#58a6ff', width: 2 } },
      showlegend: true,
      visible: 'legendonly',
    },
    {
      x: [median_pnl], y: [null], mode: 'markers', type: 'scatter',
      name: `Median $${median_pnl.toFixed(0)}`,
      marker: { color: '#d29922', size: 9, symbol: 'line-ew-open', line: { color: '#d29922', width: 2 } },
      showlegend: true,
      visible: 'legendonly',
    },
    {
      x: [0], y: [null], mode: 'markers', type: 'scatter',
      name: 'Breakeven',
      marker: { color: '#ffffff', size: 9, symbol: 'line-ew-open', line: { color: '#ffffff', width: 2 } },
      showlegend: true,
      visible: 'legendonly',
    },
  ]

  const layout = {
    ...DARK_BASE,
    shapes,
    xaxis: {
      title: { text: 'PnL per Trade ($)', font: { size: 11 } },
      gridcolor: '#21262d',
      zerolinecolor: '#30363d',
      tickformat: '$.2s',
    },
    yaxis: {
      title: { text: 'Count', font: { size: 11 } },
      gridcolor: '#21262d',
      zerolinecolor: '#30363d',
    },
    bargap: 0.04,
  }

  return (
    <Plot
      data={[histTrace, ...legendTraces]}
      layout={layout}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: 320 }}
      useResizeHandler
    />
  )
}
