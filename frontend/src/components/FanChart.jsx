/**
 * Monte Carlo Path Fan Chart
 *
 * Visualises the spread of 10 000 simulated equity paths as:
 *   – P5–P95 outer band (light fill)
 *   – P25–P75 inner band (darker fill)
 *   – Median path (bright line)
 *   – 500 individual sample paths (very faint, concatenated into one trace)
 *
 * All paths are concatenated into a single Plotly scatter trace using null
 * separators so the DOM stays lightweight (no hundreds of separate traces).
 */
import { useMemo } from 'react'
import Plot from '../Plot.jsx'

const DARK_BASE = {
  paper_bgcolor: '#161b22',
  plot_bgcolor:  '#0d1117',
  font:   { color: '#e6edf3', family: 'Inter, system-ui, sans-serif', size: 12 },
  legend: { bgcolor: 'rgba(0,0,0,0)', borderwidth: 0, x: 0.02, y: 0.97 },
  margin: { l: 70, r: 20, t: 16, b: 60 },
}

export default function FanChart({ data, initialCapital }) {
  if (!data) return null

  const { sample_paths, median_path, p5_path, p25_path, p75_path, p95_path } = data
  const nPoints = median_path.length
  const x = Array.from({ length: nPoints }, (_, i) => i)  // trade index axis

  // Divide by 1e6 for $M display
  const toM = arr => arr.map(v => v / 1e6)

  // ── Build fan-path trace: all sample paths joined with null separators ──────
  const fanX = useMemo(() => {
    const out = []
    for (const path of sample_paths) {
      for (let i = 0; i < path.length; i++) out.push(i)
      out.push(null)
    }
    return out
  }, [sample_paths])

  const fanY = useMemo(() => {
    const out = []
    for (const path of sample_paths) {
      for (const v of path) out.push(v / 1e6)
      out.push(null)
    }
    return out
  }, [sample_paths])

  // ── Traces ─────────────────────────────────────────────────────────────────
  const traces = [
    // P95 (outer band upper — fill down to P5)
    {
      x, y: toM(p95_path),
      type: 'scatter', mode: 'lines',
      name: 'P5–P95',
      line: { color: 'rgba(88,166,255,0)', width: 0 },
      showlegend: false,
      hoverinfo: 'skip',
    },
    // P5 (outer band lower — fills back to P95)
    {
      x, y: toM(p5_path),
      type: 'scatter', mode: 'lines',
      name: 'P5–P95',
      fill: 'tonexty',
      fillcolor: 'rgba(88,166,255,0.12)',
      line: { color: 'rgba(88,166,255,0)', width: 0 },
      hoverinfo: 'skip',
    },
    // P75 (inner band upper)
    {
      x, y: toM(p75_path),
      type: 'scatter', mode: 'lines',
      name: 'P25–P75',
      line: { color: 'rgba(88,166,255,0)', width: 0 },
      showlegend: false,
      hoverinfo: 'skip',
    },
    // P25 (inner band lower)
    {
      x, y: toM(p25_path),
      type: 'scatter', mode: 'lines',
      name: 'P25–P75',
      fill: 'tonexty',
      fillcolor: 'rgba(88,166,255,0.22)',
      line: { color: 'rgba(88,166,255,0)', width: 0 },
      hoverinfo: 'skip',
    },
    // Individual sample paths (single concatenated trace)
    {
      x: fanX,
      y: fanY,
      type: 'scatter', mode: 'lines',
      name: 'Paths',
      line: { color: 'rgba(88,166,255,0.07)', width: 0.5 },
      hoverinfo: 'skip',
      showlegend: false,
    },
    // Median path
    {
      x, y: toM(median_path),
      type: 'scatter', mode: 'lines',
      name: 'Median',
      line: { color: '#ffffff', width: 2 },
    },
  ]

  // Initial capital reference line
  const shapes = [{
    type: 'line', xref: 'paper', yref: 'y',
    x0: 0, x1: 1,
    y0: initialCapital / 1e6, y1: initialCapital / 1e6,
    line: { color: '#8b949e', width: 1, dash: 'dash' },
  }]

  const layout = {
    ...DARK_BASE,
    shapes,
    xaxis: {
      title: { text: 'Trade Number', font: { size: 11 } },
      gridcolor: '#21262d',
      zerolinecolor: '#30363d',
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
      data={traces}
      layout={layout}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: 320 }}
      useResizeHandler
    />
  )
}
