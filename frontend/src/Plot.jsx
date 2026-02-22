/**
 * Shared Plotly React component built with the factory pattern.
 *
 * Using plotly.js-dist-min (pre-built, all chart types) avoids the CJS/ESM
 * interop issues that plain `react-plotly.js` can hit with Vite.
 */
import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js-dist-min'

const Plot = createPlotlyComponent(Plotly)
export default Plot
