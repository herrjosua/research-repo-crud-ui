# Research Repo CRUD UI

A multi-user web app that adds a full CRUD interface, login, and git-based edit
attribution on top of the [Agentic UX Research Repo](https://github.com/herrjosua/agentic-repo) (a
separate repo — this app reads/writes its markdown content but is not stored
inside it, to avoid risking that repo's working content).

**Stack:** React (Vite) frontend using the [Carbon Design
System](https://carbondesignsystem.com/) for accessibility-first components,
Node/Express backend, SQLite for user accounts and sessions only (markdown
files remain the source of truth for research content).

## Project structure

```
Research Repo CRUD UI/
├── backend/    Node/Express API — see backend/README.md for setup, env vars, and the full API reference
├── frontend/   React app — see frontend/README.md for setup and stack decisions
├── e2e/        Playwright + axe-core end-to-end and accessibility tests — see e2e/README.md
├── scripts/    deploy.sh (runs on the webhost), ssh-deploy-wrapper.sh and ssh-retry-classify.sh (used by the CD workflow to reach it), and their test harnesses — see docs/deploy.md
├── docs/       deploy.md, the deploy runbook
├── .github/workflows/   ci.yml (see CI below) and deploy.yml (tag-triggered CD, see docs/deploy.md)
├── LICENSE
└── .gitignore
```

## Getting started

This is a two-part app — the backend must be running before the frontend can
do anything useful (it proxies all `/api` calls to it in dev). Start with
[`backend/README.md`](./backend/README.md) for setup, then
[`frontend/README.md`](./frontend/README.md).

You also need a checkout of the agentic-repo with its Python environment
(`requirements.txt`, Python 3.13). The backend requires `AGENTIC_REPO_ROOT`
and `PYTHON_BIN` in `backend/.env` and refuses to start without
`AGENTIC_REPO_ROOT`. The tests only read the Python scripts from it: they use
`REAL_AGENTIC_REPO_ROOT` if set, otherwise an `agentic-repo` folder next to
this repo.

## Demo mode

With `DEMO_MODE=true` in `backend/.env`, the backend seeds three demo users at
startup (Priya Patel, UX Researcher; Sam Okafor, Product/UX Designer; Jordan
Lee, Research Ops Lead), and the login page shows a picker for passwordless
login as one of them. Self-signup is closed, and the demo usernames can't log
in with a password. The picker and the dashboard both show a "Demonstration
environment" notice saying the data is fictional and resets hourly (the reset
itself is a host cron job outside this repo). See
[`backend/README.md`](./backend/README.md) for the demo endpoints and their
rate limits.

## Testing

Every automated run is kept away from the real agentic-repo: under
`NODE_ENV=test` (Jest and the Playwright backend) the backend refuses to start
unless `AGENTIC_REPO_ROOT` is a throwaway repo created by
[`backend/tests/helpers/setupTestRepo.js`](./backend/tests/helpers/setupTestRepo.js),
which copies the real Python scripts into a fresh, git-initialized temp folder.

- **Backend**: Jest + supertest (`cd backend && npm test`) — covers the auth
  flow (signup/login/logout/rate-limiting, plus demo-mode auth), the records
  CRUD paths (create/read/update/delete, the raw-session-is-two-files edge
  case, git attribution, and edit history), commits that contain only the
  files a request changed plus the repo write lock (`tests/gitScope.test.js`),
  production serving (`tests/production.test.js`), the throwaway-repo guard,
  and a dedicated adversarial
  security suite (`tests/security.test.js` — path traversal, SQL injection,
  oversized request bodies, tampered session cookies, XSS via markdown
  links, security headers/`robots.txt`/write-route rate limiting, and the
  HTTPS redirect middleware; found and fixed two real vulnerabilities and
  one information-leak bug along the way).
- **Frontend**: Vitest + React Testing Library (`cd frontend && npm test`) —
  covers `LoginForm`'s success/error/pending states, `Dashboard`'s kind/tag
  filtering and delete warnings, `DemoUserPicker`'s profile selection and
  login states, researcher attribution in `CreateSessionForm` and
  `EditRecordForm`, and `RecordDetail`'s save warnings and read-only
  generated components. Lint with `npm run lint`.
- **End-to-end + accessibility**: Playwright + axe-core, in two separate
  configs — the regular suite (`cd e2e && npm test`) drives a real browser
  through login → browse → logout, a keyboard-only walkthrough of the
  dashboard/record detail/delete-confirmation dialogs, a mouse regression test
  for the delete confirmation, and layout checks across Carbon's md widths
  (672–1055px); a second config
  (`npm run test:demo`) exercises the demo user picker specifically, with its
  own backend instance running in demo mode. The backend in both runs against
  a throwaway repo built from a fixed corpus in `e2e/fixtures/corpus/`. Both
  run an automated WCAG 2 AA
  scan (via `@axe-core/playwright`) against every major screen and modal
  state — found and fixed three real accessibility issues along the way,
  including a genuine bug in Carbon's own nested-modal focus handling. See
  [`e2e/README.md`](./e2e/README.md) for setup and the full list of findings.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every push
and pull request to `main`, as four jobs:

- **frontend**: `npm ci`, `npm run lint`, and the Vitest suite on Node 24.
- **backend**: checks out
  [`herrjosua/agentic-repo`](https://github.com/herrjosua/agentic-repo)
  (`main`) for the Python scripts the tests copy, installs its
  `requirements.txt` on Python 3.13, and runs the Jest suite.
- **deploy-script**: shellcheck on `deploy.sh`, `ssh-retry-classify.sh`, and
  their tests, then `scripts/tests/deploy.test.sh` (runs `deploy.sh` against
  a throwaway checkout and a fake process manager) and
  `scripts/tests/ssh-retry-classify.test.sh` (the SSH connection-failure
  classifier the CD workflow uses to decide whether to retry).
- **e2e**: both Playwright configs, as two matrix legs (`e2e (main)` and
  `e2e (demo)`) so a failure in one never hides the other. Each sets up
  agentic-repo and Python like the backend job, installs Chromium only, and
  runs `npm test` or `npm run test:demo`, whose own `webServer` settings
  start the frontend and a backend on a throwaway repo. On failure, the HTML
  report and traces are uploaded as the `playwright-main` or
  `playwright-demo` artifact.

## Production

With `NODE_ENV=production`, one Node process serves both the API and the built
frontend (`frontend/dist`, from `npm run build` in `frontend/`), with
client-side routes falling back to `index.html`; the backend won't start if
the build is missing. Every production setting is listed, with comments, in
[`backend/.env.production.example`](./backend/.env.production.example),
including:

- **Proxy trust** for traffic arriving through Cloudflare and the host's
  proxy: the host proxy's address (`TRUST_PROXY`, default `loopback`) plus
  Cloudflare's published IP ranges in
  [`backend/proxyTrust.js`](./backend/proxyTrust.js), so the rate limiters see
  the real visitor IP.
- **`ALLOWED_HOSTS`**: requests for any other hostname get `421`.
- **`HTTPS_REDIRECT`**: the app's own HTTP→HTTPS redirect, off in the example
  because Cloudflare's edge already enforces HTTPS.

`GET /api/health` returns `{ status, version, startedAt }` with
`Cache-Control: no-store`, after checking the database answers.

### Deploy

Pushing a `vX.Y.Z` tag on `main` triggers
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml): after
confirming the tag's commit actually reached `main` through a PR, the job
waits for approval against the `production` GitHub Environment, then SSHes
into the webhost — through a forced-command key, retrying a specific set of
pre-auth connection failures (`scripts/ssh-retry-classify.sh`) — to run
`scripts/deploy.sh <tag>` there. `deploy.sh` checks the tag out, rebuilds
only what changed (compiling better-sqlite3 from source for the host's older
glibc), and restarts the app through the host's process manager. It confirms
through `/api/health` that the new version is live, and rolls back
automatically if anything fails; `scripts/deploy.sh <tag>` can also be run
by hand directly on the host. See [`docs/deploy.md`](./docs/deploy.md) for
the full runbook, including the one-time manual deploy of v1.2.7 and the
one-time run of v1.2.8's own script.

## Roadmap

Continues the version numbering from the original research repo (v0.1–v0.5
shipped there). Full roadmap tracked in Notion: **Version Milestone Roadmap —
Research Repo CRUD UI**.

- [x] v0.6 — Backend Foundation (auth, sessions)
- [x] v0.7 — File CRUD API (sessions, records)
- [x] v0.8 — Git Attribution Layer
- [x] v0.9 — React Frontend: Auth + Browse
- [x] v1.0 — React Frontend: Create/Edit/Delete
- [x] v1.1 — Testing (Unit + QA)
- [x] v1.2 — Deploy + Polish
- [ ] v1.3 — Agentic LLM Layer (local, Ollama)
- [ ] v1.4 — Enterprise Integration Design (Copilot / SharePoint) — design doc only

## AI-Assisted Development

This project was built by Joshua Bock with AI assistance from Claude — used both as the AI agent this tooling is designed to work with, and as a development collaborator throughout the build (planning, implementation, testing, and code review), under direct human review and direction at every step.

## License

MIT — see [LICENSE](LICENSE).
