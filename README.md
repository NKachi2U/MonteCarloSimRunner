# Monte Carlo Portfolio Analyser

A production-grade quant analytics dashboard.  Upload a QuantConnect trade CSV, run 10 000 bootstrap Monte Carlo simulations, and explore interactive results in the browser.

**Live demo pattern:** `https://<your-github-username>.github.io/<repo-name>/`

---

## Architecture

```
monte_carlo_claudecode_app/
├── .github/workflows/deploy.yml  CI/CD — builds frontend + triggers Render
├── render.yaml                   Render backend blueprint
├── .gitignore
│
├── backend/
│   ├── main.py           FastAPI — /upload + /analyze
│   ├── monte_carlo.py    Vectorised NumPy bootstrap simulation
│   ├── analytics.py      Sharpe, drawdown, skewness …
│   ├── models.py         Pydantic models
│   └── requirements.txt
│
└── frontend/
    ├── vite.config.js    Dev proxy + VITE_BASE_PATH for GH Pages
    ├── package.json
    └── src/
        ├── api.js         VITE_API_URL — relative in dev, Render URL in prod
        ├── App.jsx        Dashboard layout + state
        ├── App.css        Dark design system
        ├── Plot.jsx       Shared Plotly wrapper (factory pattern)
        └── components/
            ├── Upload.jsx
            ├── MCDistributionChart.jsx
            ├── DistributionChart.jsx
            ├── EquityChart.jsx
            ├── FanChart.jsx
            ├── NotionalChart.jsx
            └── SummaryTable.jsx
```

---

## Local development

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
pip install -r requirements.txt
uvicorn main:app --reload
```

API docs: http://127.0.0.1:8000/docs

### Frontend (second terminal)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Deploying to GitHub Pages + Render

### Step 1 — Push to GitHub

```powershell
cd C:\Users\testi\OneDrive\Documents\monte_carlo_claudecode_app

git init
git add .
git commit -m "Initial commit"

# Create the repo on GitHub first (github.com → New repository), then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy the backend on Render

1. Go to **https://render.com** → sign up / log in (GitHub login works).
2. Click **New → Blueprint** and connect your GitHub repo.
   Render detects `render.yaml` and creates the **monte-carlo-api** web service automatically.
3. Wait for the first build to finish (≈ 2–3 minutes).
4. Copy the service URL — it looks like:
   `https://monte-carlo-api.onrender.com`

> **Free tier note:** Render free services spin down after 15 minutes of inactivity.
> The first request after a cold start takes ~30 seconds.
> You can upgrade to a paid plan ($7/month) to keep it always-on.

### Step 3 — Add GitHub Secrets

In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `VITE_API_URL` | `https://monte-carlo-api.onrender.com` (your Render URL, no trailing slash) |
| `RENDER_DEPLOY_HOOK_URL` | *(optional)* Render deploy hook URL — enables backend redeploys on push |

To get the Render deploy hook:
Render dashboard → your service → **Settings → Deploy Hook** → copy the URL.

### Step 4 — Enable GitHub Pages

In your GitHub repo → **Settings → Pages**:
- Source: **GitHub Actions**
- (No branch to select — the workflow handles everything.)

### Step 5 — Trigger the first deployment

```powershell
git commit --allow-empty -m "Trigger first deployment"
git push
```

Watch the **Actions** tab in GitHub.  When the workflow is green your site is live at:

```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

---

## How it works end-to-end

```
Browser  ──POST /upload──▶  Render (FastAPI)
         ◀── trade list ──

Browser  ──POST /analyze──▶  Render (FastAPI + NumPy MC)
         ◀── full results ──

GitHub Actions (on push to main):
  1. npm ci && npm run build   (VITE_BASE_PATH + VITE_API_URL injected)
  2. Upload dist/ as Pages artifact
  3. Deploy to github-pages environment
  4. Curl Render deploy hook  (triggers backend redeploy)
```

---

## API reference

### `POST /upload`
Accepts a QuantConnect CSV via `multipart/form-data`.
Returns: `{ trades, total_trades, symbols }`

### `POST /analyze`
```json
{
  "trades":          [...],
  "initial_capital": 1000000,
  "n_simulations":   10000,
  "n_sample_paths":  500
}
```
Returns: `{ metrics, mc_distribution, mc_paths, equity_curve, pnl_series, notional_data }`

---

## Monte Carlo methodology

```
For each of 10 000 simulations:
  1. Sample n_trades indices WITH replacement (bootstrap)
  2. equity[j] = initial_capital + Σ pnl[0..j]
  3. Record final equity and max drawdown

Fully vectorised — shape (10000, n_trades) NumPy array, no Python loops.
10 000 sims × 500 trades ≈ 0.5 s on a standard CPU.
```

---

## Requirements

| Tool | Minimum version |
|---|---|
| Python | 3.11 |
| Node.js | 18 |
| npm | 9 |
