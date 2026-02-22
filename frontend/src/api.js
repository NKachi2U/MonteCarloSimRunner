/**
 * API client module.
 *
 * Local dev:   VITE_API_URL is unset → requests use '' (relative path)
 *              → Vite dev-server proxy forwards them to http://127.0.0.1:8000
 *
 * Production:  VITE_API_URL is injected at build time
 *              (e.g. https://your-api.onrender.com)
 *              → requests go directly to the Render backend
 */

const API_BASE = import.meta.env.VITE_API_URL ?? ''

console.log("VITE_API_URL:", import.meta.env.VITE_API_URL)
console.log("Resolved API_BASE:", API_BASE)

async function handleResponse(res) {
  if (!res.ok) {
    const detail = await res.json().then(j => j.detail).catch(() => res.statusText)
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

/**
 * Upload a CSV file and receive the parsed round-trip trade list.
 *
 * @param {File} file - The CSV File object from an <input> or drop event.
 * @returns {Promise<{trades: object[], total_trades: number, symbols: string[]}>}
 */
export async function uploadFile(file) {
  const body = new FormData()
  body.append('file', file)
  return handleResponse(await fetch(`${API_BASE}/upload`, { method: 'POST', body }))
}

/**
 * Run analytics + Monte Carlo simulation on the parsed trade list.
 *
 * @param {{
 *   trades: object[],
 *   initial_capital: number,
 *   n_simulations: number,
 *   n_sample_paths: number
 * }} payload
 * @returns {Promise<object>} Full AnalysisResponse
 */
export async function runAnalysis(payload) {
  return handleResponse(
    await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  )
}
