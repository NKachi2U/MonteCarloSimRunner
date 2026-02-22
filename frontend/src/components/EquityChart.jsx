/**
 * Cumulative Equity Curve
 *
 * Filled area chart showing the historical equity curve from the backtest,
 * coloured green when above initial capital, with a reference line at IC.
 */
import Plot from '../Plot.jsx'

const DARK_BASE = {
  paper_bgcolor: '#161b22',
  plot_bgcolor:  '#0d1117',
  font:   { color: '#e6edf3', family: 'Inter, system-ui, sans-serif', size: 12 },
  legend: { bgcolor: 'rgba(0,0,0,0)', borderwidth: 0 },
  margin: { l: 70, r: 20, t: 16, b: 60 },
}

export default function EquityChart({ data, initialCapital }) {
  if (!data) return null

  const { times, equity } = data

  // Convert to $M for display
  const equityM = equity.map(v => v / 1e6)
  const icM     = initialCapital / 1e6

  // Filled area trace
  const equityTrace = {
    x:          times,
    y:          equityM,
    type:       'scatter',
    mode:       'lines',
    name:       'Portfolio Value',
    fill:       'tozeroy',
    fillcolor:  'rgba(63,185,80,0.15)',
    line:       { color: '#3fb950', width: 2 },
  }

  // Reference line for initial capital
  const shapes = [{
    type: 'line', xref: 'paper', yref: 'y',
    x0: 0, x1: 1,
    y0: icM, y1: icM,
    line: { color: '#8b949e', width: 1, dash: 'dash' },
  }]

  const layout = {
    ...DARK_BASE,
    shapes,
    xaxis: {
      title: { text: 'Date', font: { size: 11 } },
      gridcolor: '#21262d',
      zerolinecolor: '#30363d',
      type: 'date',
    },
    yaxis: {
      title: { text: 'Portfolio Value ($M)', font: { size: 11 } },
      gridcolor: '#21262d',
      zerolinecolor: '#30363d',
      tickformat: '$.2f',
    },
  }

  return (
    <Plot
      data={[equityTrace]}
      layout={layout}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: 320 }}
      useResizeHandler
    />
  )
}
