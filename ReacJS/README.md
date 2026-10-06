# InfraWatch v3 — React + Morpheus API

Morpheus-styled unified infrastructure monitoring portal with live data integration.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure Morpheus connection
cp .env.example .env.local
# Edit .env.local — set VITE_MORPHEUS_URL and MORPHEUS_TOKEN

# 3. Run (mock data by default)
npm run dev

# 4. Enable live data
# In .env.local set: VITE_USE_LIVE_DATA=true
npm run dev
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_MORPHEUS_URL` | Yes | Full URL of your Morpheus instance e.g. `https://morpheus.company.com` |
| `MORPHEUS_TOKEN` | Yes | Morpheus API token (Settings → API Access → Generate). **Do not prefix with `VITE_`**. |
| `VITE_API_BASE` | No | API prefix, default `/api` (used by Vite proxy) |
| `VITE_USE_LIVE_DATA` | No | `true` = call Morpheus, `false` = use mock data (default) |
| `VITE_AUTH_TARGET` | No | Dev proxy target for `/auth/*` (used by Login page) |
| `VITE_AUTH_BASE` | No | Frontend base path for auth endpoints (default `/auth`) |

**Never commit `.env.local` to version control.**

---

## How the Morpheus connection works

```
Browser → Vite dev proxy (/api/*) → Morpheus instance
```

The Vite proxy in `vite.config.js` rewrites `/api/*` to your Morpheus URL
and injects the Bearer token server-side — no CORS issues, no token exposed
in the browser bundle (token is **not** a `VITE_*` env var).

In production, replace the Vite proxy with your reverse proxy (nginx, Caddy,
AWS ALB) configured the same way.

---

## Project structure

```
infrawatch3/
├── .env.example                     Copy to .env.local
├── vite.config.js                   Vite + Morpheus proxy config
├── index.html
│
└── src/
    ├── App.jsx                      Root — setup wizard ↔ portal
    ├── index.css                    Morpheus design tokens (light + dark)
    ├── main.jsx
    │
    ├── data/index.js                Static catalogue + mock data
    │                                (all exports are fallbacks for the hooks below)
    │
    ├── api/
    │   ├── morpheus.js              ── Core Morpheus API layer ──
    │   │                            mFetch(), MorpheusError, normaliseInstance()
    │   │                            fetchResources(), fetchResource()
    │   │                            fetchAlerts(), fetchLogs()
    │   │                            fetchInstanceStats()
    │   │                            fetchUsers(), fetchClouds()
    │   │                            triggerRemediation()
    │   │                            poll() polling helper
    │   │
    │   ├── useResources.js          Hook → fetchResources()  (once on mount)
    │   ├── useAlerts.js             Hook → fetchAlerts()     (polls 30s)
    │   ├── useLogs.js               Hook → fetchLogs()       (re-fetches on filter change)
    │   ├── useInstanceStats.js      Hook → fetchInstanceStats() (polls 15s)
    │   └── useUsers.js              Hook → fetchUsers()      (once on mount)
    │
    ├── hooks/
    │   ├── useStore.js              Global state (useReducer, 12 actions)
    │   └── useLiveMetrics.js        Spark chart simulation (used in mock mode)
    │
    ├── components/
    │   ├── ui/
    │   │   ├── Primitives.jsx       MBtn, Badge, Ring, Spark, BarRow, Card…
    │   │   ├── Topbar.jsx           Dark topbar + breadcrumb + theme toggle
    │   │   └── LoadingSpinner.jsx   LoadingSpinner, LoadingRow, ErrorBanner
    │   │
    │   ├── wizard/
    │   │   ├── SetupWizard.jsx      4-step wizard shell
    │   │   ├── StepBar.jsx          Progress indicator
    │   │   ├── StepResources.jsx    Step 1 — live Morpheus resource list
    │   │   ├── StepTools.jsx        Step 2 — metrics + log tool dropdowns
    │   │   ├── StepDashboards.jsx   Step 3 — dashboard multi-select
    │   │   └── StepReview.jsx       Step 4 — review before launch
    │   │
    │   └── portal/
    │       ├── MainPortal.jsx       Session tabs, breadcrumb, page routing
    │       └── ResourceSwitcherModal.jsx  VM/resource switcher overlay
    │
    └── pages/
        ├── DashboardPage.jsx        Grafana / Power BI / Morpheus views
        │                            (live ring gauges via useInstanceStats)
        ├── AlertsPage.jsx           Alert list + remediation log
        │                            (live via useAlerts, polls 30s)
        ├── LogsPage.jsx             Filterable log stream
        │                            (live via useLogs, refetches on filter)
        ├── ThresholdsPage.jsx       Per-metric range sliders
        └── RBACPage.jsx             Users + roles
                                     (live via useUsers)
```

---

## Morpheus API endpoints used

| Feature | Endpoint | Docs |
|---|---|---|
| Resource list (wizard Step 1) | `GET /api/instances?max=500` | [Instances](https://apidocs.morpheusdata.com/#get-all-instances) |
| Single instance detail | `GET /api/instances/:id` | [Instance](https://apidocs.morpheusdata.com/#get-a-specific-instance) |
| Live CPU/Mem/Disk stats | `GET /api/instances/:id/stats` | [Stats](https://apidocs.morpheusdata.com/#get-instance-stats) |
| Alerts | `GET /api/monitoring/alerts` | [Monitoring](https://apidocs.morpheusdata.com/#monitoring) |
| Logs | `GET /api/logging` | [Logs](https://apidocs.morpheusdata.com/#logs) |
| Users (RBAC tab) | `GET /api/users` | [Users](https://apidocs.morpheusdata.com/#users) |
| Clouds | `GET /api/zones` | [Clouds](https://apidocs.morpheusdata.com/#clouds) |
| Trigger remediation | `POST /api/instances/:id/task` | [Tasks](https://apidocs.morpheusdata.com/#execute-task) |

---

## Data flow: mock → live

Every hook follows the same pattern:

```
VITE_USE_LIVE_DATA=false  →  returns data/index.js mock data immediately
VITE_USE_LIVE_DATA=true   →  calls Morpheus API, falls back to mock on error
```

This means the UI always renders — even if Morpheus is unreachable.
Error banners appear above each section when a call fails.

---

## Generating a Morpheus API token

1. Log in to Morpheus as an admin
2. Go to **Settings → API Access**
3. Click **Generate** next to your user
4. Copy the token into `.env.local` as `VITE_MORPHEUS_TOKEN`

The token is passed via the Vite proxy — it never appears in the browser bundle.

---

## Production deployment

Replace the Vite dev proxy with an nginx location block:

```nginx
location /api/ {
    proxy_pass         https://your-morpheus-instance.example.com/;
    proxy_set_header   Authorization "Bearer YOUR_TOKEN";
    proxy_set_header   Content-Type  "application/json";
    proxy_set_header   Host          $proxy_host;
}
```

Then build and serve:

```bash
npm run build     # outputs to dist/
npm run preview   # test the build locally
```
