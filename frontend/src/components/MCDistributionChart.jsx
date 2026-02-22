/**
 * Monte Carlo Final Portfolio Distribution
 *
 * Histogram of 10 000 simulated final equity values with:
 *  - A vertical dashed line at the initial capital (breakeven)
 *  - Annotations for key percentiles (P5, median, P95)
 */
import Plot from '../Plot.jsx'

const DARK = {
  paper_bgcolor: '#161b22',
  plot_bgcolor:  '#0d1117',
  font:   { color: '#e6edf3', family: 'Inter, system-ui, sans-serif', size: 12 },
  xaxis:  { gridcolor: '#21262d', zerolinecolor: '#30363d', tickformat: '$.3s' },
  yaxis:  { gridcolor: '#21262d', zerolinecolor: '#30363d', title: { text: 'Frequency', font: { size: 11 } } },
  legend: { bgcolor: 'rgba(0,0,0,0)', borderwidth: 0 },
  margin: { l: 60, r: 30, t: 16, b: 60 },
}

export default function MCDistributionChart({ data, initialCapital }) {
  if (!data) return null

  const { final_equities, mean_final, median_final, p5, p95 } = data

  // Histogram trace
  const histTrace = {
    x:          final_equities,
    type:       'histogram',
    name:       'A: Base',
    nbinsx:     80,
    marker:     { color: 'rgba(88,166,255,0.75)', line: { width: 0 } },
    opacity:    0.85,
  }

  // Vertical annotation lines (shapes)
  const shapes = [
    // Initial capital
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: initialCapital, x1: initialCapital, y0: 0, y1: 1,
      line: { color: '#ffffff', width: 1.5, dash: 'dash' },
    },
    // Median
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: median_final, x1: median_final, y0: 0, y1: 1,
      line: { color: '#3fb950', width: 1.5, dash: 'dot' },
    },
    // P5
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: p5, x1: p5, y0: 0, y1: 1,
      line: { color: '#f85149', width: 1, dash: 'dot' },
    },
    // P95
    {
      type: 'line', xref: 'x', yref: 'paper',
      x0: p95, x1: p95, y0: 0, y1: 1,
      line: { color: '#d29922', width: 1, dash: 'dot' },
    },
  ]

  const annotations = [
    {
      xref: 'x', yref: 'paper', x: initialCapital, y: 0.97,
      text: 'Initial<br>Capital', showarrow: false,
      font: { size: 9, color: '#ffffff' }, align: 'center',
    },
    {
      xref: 'x', yref: 'paper', x: median_final, y: 0.97,
      text: 'Median', showarrow: false,
      font: { size: 9, color: '#3fb950' }, align: 'center',
    },
    {
      xref: 'x', yref: 'paper', x: p5, y: 0.97,
      text: 'P5', showarrow: false,
      font: { size: 9, color: '#f85149' }, align: 'center',
    },
    {
      xref: 'x', yref: 'paper', x: p95, y: 0.97,
      text: 'P95', showarrow: false,
      font: { size: 9, color: '#d29922' }, align: 'center',
    },
  ]

  const layout = {
    ...DARK,
    shapes,
    annotations,
    xaxis: {
      ...DARK.xaxis,
      title: { text: 'Final Portfolio Value ($)', font: { size: 11 } },
      tickformat: '$.3s',
    },
    bargap: 0.02,
  }

  return (
    <Plot
      data={[histTrace]}
      layout={layout}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: 320 }}
      useResizeHandler
    />
  )
}
