# Research Repo CRUD UI — Frontend

React app for the CRUD UI. v0.9 (Auth + Browse) is complete: login, session
persistence, logout, and a filterable/searchable dashboard with a read-only
detail view. v1.0 (Create/Edit/Delete UI) is next.

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
ship already meeting WCAG 2.1 AA out of the box. This paid off directly: the
initial record list used a plain `Tile` with an `onClick` handler, which
turned out to be completely invisible to keyboard users (Tab skipped over
every result). Swapping to Carbon's `ClickableTile` — natively focusable and
Enter-operable — fixed it immediately, no custom ARIA/keyboard code needed.
Carbon's `Modal` similarly handles focus trapping, focus-on-open, and
Escape-to-close automatically.

## Accessibility tooling

`eslint-plugin-jsx-a11y` doesn't yet declare support for this project's
ESLint version (10.x, as of testing in Sept 2026) — rather than force an
unverified peer-dependency resolution, this project relies on **IntelliJ's
built-in HTML accessibility inspections** instead:

**Settings → Editor → Inspections → HTML → Accessibility**

Confirmed working on `.jsx` files. If you're using a different editor,
you'll need an equivalent — this project has no lint-time a11y check wired
into `npm run lint` yet.

**Manual keyboard testing matters too, not just linting.** The `Tile` vs.
`ClickableTile` issue above was caught by physically tabbing through the
page, not by any inspection or linter — worth doing for any new interactive
element.

## CSS architecture

Each component has its own co-located `.module.scss` file (e.g.
`Dashboard.jsx` + `Dashboard.module.scss`, flat in `src/` — no
per-component folders yet, since nothing has more than two files). One
shared `src/styles/_variables.scss` partial holds design tokens (spacing,
header height) that components pull in via `@use`. CSS Modules were chosen
over a single global stylesheet specifically to avoid manual class-name
collision management as the component count grows — each component's
classes are automatically scoped by the build tool.

## Data fetching pattern: lazy loading

`GET /api/records` returns every record's full content (including rendered
HTML) by default — fine for a handful of records, but wasteful for a list
view showing dozens. The backend's `export_records.py` got a `--summary`
flag (strips `html`/`searchText`) threaded through as `?summary=true`; the
dashboard's list view uses that, and a separate `useRecord(id)` hook fetches
one record's full content only when it's actually opened, via React Query's
per-id caching (`queryKey: ['record', id]`) so re-opening the same record
doesn't re-fetch it.

## Rendering record content safely

`RecordDetail.jsx` renders each record's pre-rendered HTML body via
`dangerouslySetInnerHTML`. This is safe specifically because that HTML is
generated at build time by the agentic-repo's own Python pipeline
(`build_search_ui.py`'s markdown renderer) from files this app itself
writes — never from arbitrary or third-party input. The same trust boundary
`research/search.html` already relies on.

## Project structure

```
frontend/
├── vite.config.js         Dev server + /api proxy to the backend
├── src/
│   ├── api/
│   │   ├── client.js       Shared fetch wrapper — credentials included, JSON in/out, error handling
│   │   ├── auth.js         useLogin, useLogout, useSignup (hook, no screen yet), useMe
│   │   └── records.js      useRecords (summary list), useRecord (full detail, on demand)
│   ├── styles/
│   │   └── _variables.scss Shared Sass tokens (spacing, header height)
│   ├── App.jsx              Top-level: session gate (login vs. dashboard), header
│   ├── App.module.scss
│   ├── Header.jsx           Carbon Header + logout action
│   ├── LoginForm.jsx         Carbon Form, wired to useLogin
│   ├── Dashboard.jsx         Kind + tag filtering, record list, opens RecordDetail
│   ├── Dashboard.module.scss
│   ├── RecordDetail.jsx      Carbon Modal, fetches full record content on open
│   ├── index.scss           `@use '@carbon/react';` — Carbon's base styles
│   └── main.jsx             React Query's QueryClientProvider
```

## Still to build

**v1.0 (Create/Edit/Delete):**
- Form for new research session / finding (`POST /sessions`)
- Edit form for existing records (`PUT`)
- Delete with confirmation
- Show `last_edited_by` + a "view history" link (`GET /records/:id/history`)

**v1.1 (Deploy + Polish):**
- Responsive layout (currently desktop-oriented — intentionally deferred)
- A signup screen (`useSignup()` exists in `api/auth.js`, unused so far)
- Deploy target: leaning AWS free tier or the existing webhost, both free

See the Version Milestone Roadmap in Notion for full detail and decision
rationale.
