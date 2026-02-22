/**
 * Position Notional Over Time
 *
 * Bar chart showing the absolute entry notional of each trade against its
 * exit timestamp.  Gives a quick sense of position sizing over the backtest.
 */
import Plot from '../Plot.jsx'

const DARK_BASE = {
  paper_bgcolor: '#161b22',
  plot_bgcolor:  '#0d1117',
  font:   { color: '#e6edf3', family: 'Inter, system-ui, sans-serif', size: 12 },
  legend: { bgcolor: 'rgba(0,0,0,0)', borderwidth: 0 },
  margin: { l: 70, r: 20, t: 16, b: 60 },
}

export default function NotionalChart({ data }) {
  if (!data) return null

  const { times, notionals } = data
  const notionalsM = notionals.map(v => v / 1e6)

  const trace = {
    x:       times,
    y:       notionalsM,
    type:    'bar',
    name:    'Entry Notional',
    marker:  { color: 'rgba(88,166,255,0.6)', line: { width: 0 } },
  }

  const layout = {
    ...DARK_BASE,
    xaxis: {
      title: { text: 'Date', font: { size: 11 } },
      gridcolor: '#21262d',
      zerolinecolor: '#30363d',
      type: 'date',
    },
    yaxis: {
      title: { text: 'Notional ($M)', font: { size: 11 } },
      gridcolor: '#21262d',
      zerolinecolor: '#30363d',
      tickformat: '$.2f',
    },
    bargap: 0.15,
  }

  return (
    <Plot
      data={[trace]}
      layout={layout}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: 320 }}
      useResizeHandler
    />
  )
}
