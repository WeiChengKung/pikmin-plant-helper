# Pikmin Flower Plant Tracker

Spreadsheet-style web tracker for Pikmin Bloom flower planting stats. Layout and formulas match the Excel sheet (`Plant`). Data syncs through a GitHub Gist; the site deploys on GitHub Pages.

## Features

- Session log: Date, Pikmin Num, Flower, Time Spent, Flower/min, P duration (from Pikmin Num), Flower/Petal (`Flower/min ÷ P duration`), Petal Spent
- Color planner: white / yellow / red / blue nectar & petal inputs with Excel-equivalent formulas; P duration select (30/20/15/12/10 sec)
- Green cells = editable; gray rows = F Accumulated / Expect End P
- Local draft in `localStorage`; Load / Save via GitHub Gist API

## Quick start (local)

Open `index.html` in a browser, or from the repo root serve the folder:

```powershell
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Gist setup

1. Create a [new Gist](https://gist.github.com/) (secret or public).
2. Add a file named exactly `pikmin-data.json` with content `{}` or copy [`data/pikmin-data.json`](data/pikmin-data.json).
3. Copy the Gist ID from the URL (`https://gist.github.com/USER/<GIST_ID>`).
4. Create a GitHub Personal Access Token with **gist** scope ([tokens](https://github.com/settings/tokens)).
5. In the web app: **Settings** → paste Gist ID + token → **Save settings**.
6. Use **Save Gist** / **Load Gist**.

Token is stored only in your browser `localStorage`. Do not commit tokens.

## Deploy to GitHub Pages

```powershell
git init
git add .
git commit -m "feat: Pikmin flower plant tracker with Gist sync"
gh repo create pikmin-web --public --source=. --remote=origin --push
```

Then enable Pages:

- Repo → **Settings** → **Pages** → Source: **GitHub Actions**

Or use the included workflow (`.github/workflows/pages.yml`). After the first push to `main`, the site will be at:

`https://<username>.github.io/pikmin-web/`

If the repo name differs, update `base` is not required (this is a plain static site with relative paths).

## Data shape

```json
{
  "version": 1,
  "updatedAt": "2026-07-21T00:00:00.000Z",
  "sessions": [
    {
      "date": "2026-07-21",
      "pikminNum": 39,
      "flower": 15011,
      "timeSpent": 89,
      "petalSpent": null
    }
  ],
  "planner": {
    "avgFP": 30,
    "pDuration": 12,
    "flowerTarget": 15000,
    "nectar": { "white": 209, "yellow": 258, "red": 143, "blue": 173 },
    "petal": { "white": 550, "yellow": 550, "red": 550, "blue": 550 },
    "realTime": { "white": null, "yellow": null, "red": null, "blue": null },
    "resultEndP": { "white": null, "yellow": null, "red": null, "blue": null }
  }
}
```

## Formula notes (from Excel)

| Row | Logic |
|-----|--------|
| Session Flower/min | Flower ÷ Time Spent |
| Session P duration | from Pikmin Num: 1–9→30s, 10–19→20s, 20–29→15s, 30–39→12s, 40+→10s |
| Session Flower/Petal | Flower/min ÷ P duration |
| equal P sum | Petal + Nectar × 2 |
| -min P | equal P − min(equal P) |
| est. F per P | -min P × Avg. F/P |
| avg remain F | `(target − Σ est.F)` split across colors (Excel IF) |
| total F | est. F + avg remain F; if &lt; 0 set to 0, other colors rescale to flower target |
| Expect P Spent | total F / Avg. F/P |
| Expect Time | Expect P / 60 × P duration (min) |
| Expect End P | Petal − Expect P Spent |
| Result P spent | Petal − Result End P |
| Delta | Result End P − Expect End P |
| End eq. P sum | Nectar × 2 + Result End P |

Default flower target is **15000** (Excel `N8`).
