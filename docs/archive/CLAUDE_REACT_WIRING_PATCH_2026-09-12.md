# React app wiring patch — 2026-09-12 (round 2: deploy + 3D)

## Round 2 additions (on explicit request)

- **Netlify now actually publishes the React app.** `netlify.toml`: `command = "npm run build:site"`,
  `publish = "dist/react"`. Before this, the React app existed in the repo but was never what
  Netlify served — that's why the "premium" changes never appeared live.
- **Fixed a pre-existing missing redirect**: there was no `/api/* → /.netlify/functions/:splat`
  rule anywhere in the root `netlify.toml`. Every plain `/api/trace-data`, `/api/ai-chat`,
  `/api/ai-deploy`, `/api/data-intake-import`, `/api/diagnostic-*` call in **both** the old and
  new app depended on a redirect that didn't exist. Added it. Worth confirming with your team
  whether this was already silently broken in the currently-live site.
- **`scripts/copy-static-for-publish.mjs`**: runs after `vite build` and copies everything the
  site still needs at its old root-relative path — `manifest.json`, `icon-192.png`,
  `icon-512.png`, `logo.png`, `sw.js`, the `features/acquisition_os` sub-app, and
  `trace-acquisition-os.html`. Also publishes `well-known/assetlinks.json` at the *correct*
  standard path `/.well-known/assetlinks.json` (the source folder is literally named
  `well-known`, missing the leading dot — a separate pre-existing issue, fixed as a side effect).
- **Legacy app kept as a manual fallback**, not deleted: the old root `index.html` is copied to
  `/legacy-classic.html` in the published output. "/" is now owned by the React app.
- **3D hero (`three`) added to the Overview page**: a small rotating wireframe + particle
  visual in a glass panel next to the live-data summary. Implementation notes:
  - `three` is **dynamically imported** (`import('three')`) inside a `useEffect`, so it's a
    separate ~130 KB gzipped chunk that only loads when Overview renders — it does not bloat
    the main bundle.
  - Respects `prefers-reduced-motion` (renders one static frame instead of animating).
  - Wrapped in try/catch and fully tears down (geometry/material/renderer disposed, canvas
    removed) on unmount — if WebGL is unavailable/blocked, the panel just stays empty instead
    of crashing the page.
  - It's decorative (`aria-hidden="true"`) — no chart data is encoded in it; the real data
    visuals are the recharts charts in Analytics.

## Verified before packaging (round 2)

```
npm install
npm run typecheck:core     # PASS
npm run typecheck:react    # PASS
npm run build:site         # PASS — vite build + static-asset copy into dist/react
npm run test:deterministic # PASS
node tests_core/react-production-wiring.mjs  # PASS
```

`dist/react/` after build contains: `index.html`, hashed JS/CSS assets, `three.module-*.js` as
its own chunk, `manifest.json`, `icon-192.png`, `icon-512.png`, `logo.png`, `sw.js`,
`features/acquisition_os/**`, `trace-acquisition-os.html`, `legacy-classic.html`,
`well-known/assetlinks.json`, and `.well-known/assetlinks.json`.

## Still worth doing before a real production deploy

- Run an actual Netlify **deploy preview** (not just a local build) to confirm the redirect and
  functions behave the same on Netlify's edge as they do locally.
- The main JS chunk is ~905 KB gzip 273 KB — fine to ship, but if load time matters, the biggest
  win is code-splitting `pdf`/`xlsx` parsing behind the Data Intake screen instead of the main
  chunk (they're already separate chunks, just not lazy-loaded yet).
- `kpi`/`sop`/`collaboration` are still demo-only (no backend persistence) — see round 1 notes
  below for why, and what a real version would need.

---

# React app wiring patch — 2026-09-12 (round 1)

Scope of this pass (done by Claude on request): wire the previously-installed-but-unused
visual libraries into the React app (`src/app/main.tsx`, `src/styles/tokens.css`) and connect
several core engines that had logic but no UI.

## What changed

- **recharts** — real charts now render in a new `Analytics` view: a bar chart of live entity
  counts (Companies/Brands/Outlets/Clients) and a line chart of governance/audit activity
  grouped by day. Both are driven by data actually read from Supabase; no numbers invented.
- **motion** (framer-motion successor) — the view switcher now cross-fades between screens
  instead of hard-cutting.
- **@radix-ui/react-tooltip** — sidebar nav buttons now show accessible tooltips.
- **@radix-ui/react-popover** — KPI cards in Analytics show formula + evidence source on click.
- **@radix-ui/react-dropdown-menu** — task status changes in the new `Business Twin` board.
- **@radix-ui/react-dialog** — client rows in the new `Clients` view open a detail dialog.
- **`kpi.ts`** — wired into `Analytics`. KPIs are built with `previous: null` (marked
  unavailable, not zero) because there is no stored prior-period snapshot yet.
- **`collaboration.ts`** and **`sop.ts`** — wired into a new `Business Twin` view as an
  interactive kanban + SOP checklist. This is a **local, session-only draft**, clearly labeled
  as such in the UI, because there is no write endpoint yet for tasks or SOPs
  (`netlify/functions/` has no `tasks` or `sop` route).
- **`auditGovernance.ts`** (`auditDiff`) — the Governance view's audit log now shows a real
  field-level before/after diff instead of raw JSON dumps.
- **`aiMaintenance.ts`** — the Settings "Approval gate" card now reflects the actual
  `requiresApproval('deploy','production')` policy check instead of static copy.
- **`reporting.ts`** was intentionally left unwired. Wiring it would have required fabricating
  finance/diagnosis data to satisfy its input shape, which conflicts with this codebase's own
  evidence-first rule (see `react-truthfulness` test). It's ready to use once Finance and
  Diagnosis have real computed results to hand it.
- `tokens.css` was reworked to match the accent/gradient/shadow language already used in the
  legacy `index.html` "Premium Layer" (glow on hover, gradient buttons/active nav, glass
  sidebar/topbar) instead of the previous flat generic card style.
- Added `.trace-badge`, `.trace-dropdown`, `.trace-popover`, `.trace-dialog-*`,
  `.trace-kanban*`, `.trace-tooltip` utility classes used by the above.

## Verified before packaging

```
npm install
npm run typecheck:core     # PASS
npm run typecheck:react    # PASS
npm run build:react        # PASS (vite build succeeds)
npm run test:deterministic # PASS (all existing suites)
node tests_core/react-production-wiring.mjs  # PASS
```

## What this does NOT do

- Does **not** deploy the React app. `netlify.toml` still has `publish = "."`, so the site
  Netlify serves is still the legacy root `index.html`. This was a deliberate choice — flipping
  the publish target affects every route (including `acq-google-places.js` etc. that assume
  root-relative paths) and shouldn't happen without an explicit decision and a deploy-preview
  check first.
- Does **not** flesh out `kpi`/`sop`/`collaboration` beyond the demo wiring above into a
  persisted, multi-user feature — that needs new `netlify/functions/*` endpoints and Supabase
  tables/RLS policies, which is a separate, larger piece of work.
- Recharts/motion/three/radix are now *used* for tooltip/popover/dropdown/dialog/charts/motion;
  `three` (3D) still has no caller — nothing in this app's current feature set calls for 3D
  rendering, so it was left uninstalled-from-use rather than wired in artificially.
