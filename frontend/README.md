# Research Repo CRUD UI — Frontend

React app for the CRUD UI. Currently v0.9, **in progress** — scaffolding and
core tooling are done; the actual screens (login, dashboard, detail view)
are not yet built.

**Stack:** Vite + React, [Carbon Design System](https://carbondesignsystem.com/)
for components, [TanStack Query](https://tanstack.com/query) for data
fetching/caching.

## Setup

Requires the backend running first (see [`../backend/README.md`](../backend/README.md))
— this app proxies all `/api/*` requests to it.

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173` by default. The Vite dev server proxies
`/api` to `http://localhost:3001` (configured in `vite.config.js`), so
session cookies work correctly across the frontend/backend origin split in
dev without needing CORS config on the Express side.

## Why Carbon, not Tailwind

The project started with Tailwind, then switched to Carbon mid-setup.
Accessibility is one of Carbon's core design principles — its components
ship already meeting WCAG 2.1 AA (label association, focus management,
keyboard nav, ARIA wiring) out of the box. Given the goal of a clean,
minimal-effort, Section 508–compliant site, this trades a small learning
curve for meaningfully less hand-built accessibility work than Tailwind +
custom components would have required. Tailwind was fully removed rather
than run alongside Carbon.

## Accessibility tooling

`eslint-plugin-jsx-a11y` doesn't yet declare support for this project's
ESLint version (10.x, as of testing in Sept 2026) — rather than force an
unverified peer-dependency resolution, this project relies on **IntelliJ's
built-in HTML accessibility inspections** instead:

**Settings → Editor → Inspections → HTML → Accessibility**

Confirmed working on `.jsx` files (tested: "Missing required 'alt' attribute"
correctly flagged on a bare `<img>`). If you're using a different editor,
you'll need an equivalent — this project has no lint-time a11y check wired
into `npm run lint` yet.

## Project structure

```
frontend/
├── vite.config.js     Dev server + /api proxy to the backend
├── src/
│   ├── api/
│   │   └── client.js  Shared fetch wrapper — credentials included, JSON in/out, error handling
│   ├── index.scss     `@use '@carbon/react';` — Carbon's base styles
│   ├── main.jsx        Wraps the app in React Query's QueryClientProvider
│   └── App.jsx          (not yet built out — still the Vite starter page)
```

## Still to build (v0.9)

- Login / signup screens, wired to the backend's `/api/auth/*` endpoints
- Dashboard: list/filter view (lifting filtering UX from the agentic-repo's
  existing `research/search.html`)
- Detail view for a single record, read-only

See the Version Milestone Roadmap in Notion for the full plan through v1.1.
