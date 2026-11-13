# Frontend — Residual-based ODE EWS IPS dashboard

A React + Vite single-page app that drives the detection backend and visualises
DDoS early-warning results in real time: a live dashboard, alert history,
statistics, a network topology, detection performance and an admin console. Every
page talks to the backend engine (`/api/dlt/*`) through the shared API client
(`src/api/ews.js`).

---

## Project structure

```
frontend/
├── index.html
├── vite.config.js          Vite config + dev proxy (/api/dlt → :5001)
├── tailwind.config.js      Tailwind theme (custom color tokens)
├── postcss.config.js
├── package.json
└── src/
    ├── main.jsx            React entrypoint
    ├── App.jsx             Router + layout; "/" is the live Dashboard
    ├── index.css           Tailwind layers + globals
    ├── api/
    │   ├── ews.js          single axios client for every /api/dlt endpoint
    │   └── dltExport.js    POST /export helper (server-side CSV write)
    ├── hooks/
    │   ├── useDltAnalysis.js  upload/capture workflow + 1 s polling of /status
    │   └── usePolling.js      generic "fetch + poll every N ms" (dashboard, monitor)
    ├── pages/              one component per route (see Routing below)
    ├── components/
    │   ├── Navbar.jsx      top nav + light/dark toggle
    │   ├── ui/             PageHeader, MetricCard, ThreatBadge
    │   └── dlt/            result visualisations (charts, cards, grid controls)
    ├── theme/
    │   ├── ThemeContext.jsx   light/dark theme provider
    │   └── threatColors.js    severity ramp (green = Low, amber = Med, red = High)
    └── images/            background art
```

---

## Routing

| Path | Page | Purpose |
|------|------|---------|
| `/` | Dashboard | Live security dashboard (home). |
| `/flow-analysis` | Upload | Upload a CSV and watch the per-second analysis reveal. |
| `/live-monitor` | Live | Auto-refreshing table of live-captured, graded traffic. |
| `/alerts`, `/alerts/:id` | Alerts | Alert history and per-alert detail. |
| `/statistics` | Statistics | Charts: level breakdown, attack types, over-time, top sources. |
| `/topology` | Topology | Live source→network topology. |
| `/admin` | Admin | Blocked IPs, email notifications, data-storage location, report export. |
| `/ml-info` | ML Info | Description of the detection engine, baselines and thresholds. |
| `/mobile` | Mobile dashboard | Compact dashboard with no desktop navbar. |

---

## Development

```bash
npm install
npm run dev        # Vite dev server, usually http://localhost:5173
```

The dev server proxies `/api/dlt/*` to `http://localhost:5001` (the backend), so
all API calls use relative URLs — no CORS and no hard-coded host. Start the
backend first (`cd ../backend && python dlt_app.py`).

## Production build

```bash
npm run build      # static assets → frontend/dist/
npm run preview    # preview the production build locally
```

Serve `frontend/dist/` behind any static host and reverse-proxy `/api/dlt/*` to
the backend, or bundle the build into the desktop app so a single Flask process
serves both (see ../BUILD.md).

---

## Key conventions

- **One API client.** `src/api/ews.js` wraps every endpoint; components never
  call `axios` directly. `describeError()` turns a dropped backend into a
  friendly "start the engine" message.
- **Polling, not websockets.** `/status` is polled ~1×/s during an analysis;
  `/dashboard` and `/live/monitor` refresh every few seconds via `usePolling`.
- **Theme tokens.** Colours are Tailwind tokens defined in `tailwind.config.js`
  and `src/index.css`, with a light and a dark palette; the saved mode is applied
  before first paint (see `index.html`) to avoid a flash.
