# Research Repo CRUD UI — Backend

Node/Express API for the CRUD UI. Handles auth, session management, and all
file CRUD against the [Agentic UX Research Repo](../../agentic-repo) by
shelling out to its Python scripts (and, where no script exists, editing
markdown files directly).

**Stack:** Express, `better-sqlite3` (users + sessions only — markdown files
remain the source of truth for research content), `express-session` +
`bcrypt` for auth, `gray-matter` for frontmatter parsing, Jest + supertest
for testing.

v0.6–v1.2 are complete (backend foundation through deploy). See the Version
Milestone Roadmap in Notion for full detail and decision rationale.

## Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Generate a session secret and paste it into `.env`:
```bash
openssl rand -base64 32
```
Find your agentic-repo venv's Python path (needed so the server calls the
right interpreter — one that has `python-frontmatter` installed — rather than
whatever bare `python3` resolves to on `PATH`, which ServBay shadows with a
broken shim on this machine):
```bash
cd /absolute/path/to/your/agentic-repo
source .venv/bin/activate
which python3
```
`.env` should end up looking like:
```
PORT=3001
NODE_ENV=development
SESSION_SECRET=<paste the generated value here>
AGENTIC_REPO_ROOT=/absolute/path/to/your/agentic-repo
PYTHON_BIN=/absolute/path/to/your/agentic-repo/.venv/bin/python3
DEMO_MODE=false
```
**Never commit `.env`** — it's already covered by `.gitignore`. The server
refuses to start (`routes/records.js`) if `AGENTIC_REPO_ROOT` is unset.

For a production deployment, see
[`.env.production.example`](./.env.production.example) instead — it covers
the additional settings (`ALLOWED_HOSTS`, `TRUST_PROXY`, `HTTPS_REDIRECT`,
`FRONTEND_DIST`, `GIT_COMMITTER_NAME`/`EMAIL`) that only apply under
`NODE_ENV=production` — and [`../docs/deploy.md`](../docs/deploy.md) for the
full deploy runbook.

### 3. Run the server
```bash
cd backend
node server.js
```
You should see `Server listening on http://localhost:3001`. The SQLite
database file (`app.db`) and its tables are created automatically on first
run. If `DEMO_MODE=true`, the three demo users (see below) are also seeded
automatically at startup.

> **Note:** `server.js` lives in `backend/`, not the repo root. Running
> `node server.js` from anywhere else will fail with `MODULE_NOT_FOUND`.

## Testing

```bash
npm test
```

Runs the full Jest + supertest suite. The `backend` job in
[`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the source of
truth for what actually runs — this list is a guide to what each file
covers, not a count to keep in sync:

- **`tests/auth.test.js`** — signup, login, logout, `/me`, the rate limiter
  (including the 6th attempt still being blocked even with the correct
  password), and demo mode (`GET /demo-users`, `POST /demo-login` for all
  three identities, and confirming `/signup`/`/login` correctly refuse
  under `DEMO_MODE`).
- **`tests/records.test.js`** — `POST /sessions` (raw mode), `GET
  /records`/`GET /records/:id`, `PUT /records/:id` (including the
  gray-matter date-coercion fix), `DELETE /records/:id` (including the
  raw-session-is-two-files case), and `GET /records/:id/history` (including
  `--follow` lineage across a delete-then-recreate under the same slug).
- **`tests/gitScope.test.js`** — that each write commits only the files that
  request actually touched, and `routes/records.js`'s `withRepoLock` queue
  serializing concurrent writes to `AGENTIC_REPO_ROOT`.
- **`tests/production.test.js`** — `middleware/hostCheck.js`'s `421` on an
  unrecognized `Host`, `proxyTrust.js`'s trust-proxy setting, the HTTPS
  redirect switch, and serving the built frontend (`frontend.js`).
- **`tests/throwawayGuard.test.js`** — that the server refuses to start
  under `NODE_ENV=test` unless `AGENTIC_REPO_ROOT` points at a throwaway
  repo (`throwawayRepo.js`).
- **`tests/security.test.js`** — a dedicated adversarial suite across seven
  vectors: path traversal via `topicSlug`/`slug`, SQL injection on
  login/signup, oversized request bodies, tampered/malformed session
  cookies, XSS via markdown links, `helmet` headers/`robots.txt`/write-route
  rate limiting, and the HTTPS redirect middleware (tested directly with
  mock `req`/`res`/`next`, not through the running app — see the note in
  `middleware/httpsRedirect.js`). Found and fixed two real vulnerabilities
  (path traversal; an XSS gap in the agentic-repo's markdown renderer) and
  one information-leak bug found along the way (a generic Express error
  handler was missing, so any error — not just an oversized body — leaked a
  full stack trace including server file paths). See the Decision Log for
  the full writeup.
- **`tests/health.test.js`** — `GET /api/health`: status, the
  `package.json` version, `startedAt`, `no-store`, and nothing else in the
  body.

**No backend test ever touches the real agentic-repo.** Every test file runs
against a disposable, git-initialized fixture repo created fresh per test
run (see `tests/helpers/setupTestRepo.js`), seeded by copying the actual
Python scripts (`new_research_session.py`, `export_records.py`,
`build_index.py`, `build_search_ui.py`, `md_render.py`) from the real
agentic-repo — so tests always exercise the current real script logic,
never a stale duplicate, with zero risk to real research content or git
history. This mirrors the same isolation principle as the public demo's
separate-repo strategy (see the Decision Log), just scoped down to a local,
throwaway fixture instead of a persistent synced GitHub repo.

**Test/dev database separation.** `db.js` and `app.js` both branch on
`NODE_ENV=test` (set automatically by Jest) to use a SQLite file scoped to
the current Jest worker (`app.test.<JEST_WORKER_ID>.db`) instead of the real
`app.db` — this prevents two test files running in separate worker
processes from racing on the same file (e.g. one file's per-test table wipe
deleting another file's test user mid-run). The separate end-to-end suite
(see [`../e2e/README.md`](../e2e/README.md)) reuses this same `NODE_ENV=test`
branching — Playwright starts its own backend instance with that flag set,
rather than reusing a real dev-mode server, so E2E runs never write real
signup/session data into `app.db` either. `JEST_WORKER_ID` is unset outside
Jest, so the E2E suite's runs all land in `app.test.0.db`.

## Project structure

```
backend/
├── server.js         Entry point — imports app.js, seeds demo users if DEMO_MODE=true, starts listening
├── app.js            Express app definition (middleware, routes, generic error handler) — exported separately from server.js so tests can import it directly via supertest, without a real port
├── db.js             better-sqlite3 connection + users table schema (test/prod db split via NODE_ENV)
├── demoUsers.js       The three demo identities (Priya/Sam/Jordan) — single source of truth for seeding, the demo-login allowlist, and what the picker UI receives
├── seedDemoUsers.js   Idempotently creates the demo users on startup, only when DEMO_MODE=true
├── frontend.js        Serves the built frontend (frontend/dist) from this same process in production, with an SPA fallback for client-side routes
├── proxyTrust.js       Cloudflare's published IP ranges plus the host proxy's own address, for Express's trust-proxy setting in production
├── throwawayRepo.js    Marks/detects a disposable agentic-repo checkout made by tests/helpers/setupTestRepo.js
├── validation.js       Input validation for POST /sessions and PUT /records/:id frontmatter, mirroring agentic-repo's own field rules
├── middleware/
│   ├── rateLimiter.js    In-memory, per-IP rate limiter factory; applied to /sessions and write routes on /records
│   ├── httpsRedirect.js  HTTP→HTTPS redirect, gated on NODE_ENV=production and X-Forwarded-Proto; extracted from app.js so it's unit-testable without reloading the whole app under a different NODE_ENV
│   └── hostCheck.js      Rejects requests whose Host header isn't in ALLOWED_HOSTS (421); off when ALLOWED_HOSTS is unset
├── routes/
│   ├── health.js    GET /api/health — status, version, startedAt; polled by scripts/deploy.sh
│   ├── auth.js      Signup / login / logout / me / demo-users / demo-login
│   └── records.js   Sessions + file CRUD (shells out to agentic-repo's Python scripts); validates topicSlug/slug against a safe pattern before either reaches the Python scripts
├── tests/
│   ├── auth.test.js           Auth flow, rate limiting, and demo mode tests
│   ├── records.test.js        Records CRUD + history tests
│   ├── gitScope.test.js       Commit-scoping (only changed files) and the write-request lock/queue
│   ├── production.test.js     Host check, proxy trust, HTTPS redirect switch, and serving the built frontend
│   ├── throwawayGuard.test.js The NODE_ENV=test startup guard requiring a throwaway AGENTIC_REPO_ROOT
│   ├── health.test.js         /api/health tests
│   ├── security.test.js       Adversarial security tests (path traversal, SQL injection, oversized bodies, tampered cookies, XSS, security headers/robots.txt/rate limiting, HTTPS redirect)
│   └── helpers/
│       └── setupTestRepo.js   Creates/destroys the disposable fixture repo shared by every test file
├── .env.example              Template for required environment variables (development)
├── .env.production.example   Template for the additional settings NODE_ENV=production reads — see ../docs/deploy.md
└── app.db        SQLite file (git-ignored, created on first run; app.test.*.db files are the test-only equivalent)
```

## API

All routes below (except where noted) require a logged-in session (`401`
otherwise).

### Health (v1.2.7)

| Method | Path          | Body | Notes |
|--------|---------------|------|-------|
| GET    | `/api/health` | —    | Public, unauthenticated. `{ status: "ok", version, startedAt }` after a `SELECT 1` against the database; `503` with `status: "error"` if that fails. `version` is `backend/package.json`'s; `startedAt` is when this process loaded the app. `Cache-Control: no-store`. [`scripts/deploy.sh`](../scripts/deploy.sh) polls it to confirm a new release is live. |

### Auth (v0.6, extended in v1.2 for demo mode)

| Method | Path                     | Body                                    | Notes                                                                 |
|--------|--------------------------|-------------------------------------------|----------------------------------------------------------------------|
| POST   | `/api/auth/signup`       | `username, password, gitName, gitEmail` | Creates user, starts a session. Returns `403` when `DEMO_MODE=true`.  |
| POST   | `/api/auth/login`        | `username, password`                      | Rate-limited: 5 attempts / 15 min. Refuses the three demo usernames with `403` when `DEMO_MODE=true`. |
| POST   | `/api/auth/logout`       | —                                           | Destroys the session                                                  |
| GET    | `/api/auth/me`           | —                                           | Returns current user or `401`                                        |
| GET    | `/api/auth/demo-users`   | —                                           | Public, unauthenticated. Returns the three demo identities (`username`, `displayName`, `role`) when `DEMO_MODE=true`, else `[]`. |
| POST   | `/api/auth/demo-login`   | `username`                                | Public, unauthenticated. Passwordless login for one of the three seeded demo usernames only (validated server-side against a fixed allowlist). `404` when `DEMO_MODE` isn't set; its own IP-based rate limiter (20 requests / 15 min). |

### Records / File CRUD (v0.7)

| Method | Path                    | Body / Query                                          | Notes                                                       |
|--------|-------------------------|---------------------------------------------------------|-----------------------------------------------------------------|
| POST   | `/api/sessions`         | `{ mode: "raw" \| "deliverable", ... }`                | Wraps `new_research_session.py`. See field reference below. Rate-limited: 30 requests / 15 min per IP. |
| GET    | `/api/records`          | `?kind=raw\|finding\|component\|analytics\|deliverable` | Shells out to `export_records.py`. `kind` filter optional.       |
| GET    | `/api/records/:id`      | —                                                        | Single record by id (e.g. `raw:2026-09-15-foo`). 404 if not found. |
| PUT    | `/api/records/:id`      | `{ frontmatter?: {...}, content?: "..." }`             | Merges frontmatter, replaces content if given. Reruns `build_index.py`. Rate-limited: 30 requests / 15 min per IP. |
| DELETE | `/api/records/:id`      | —                                                        | Deletes the file (whole session folder for `kind: raw`). Reruns `build_index.py`. 204 on success. Rate-limited: 30 requests / 15 min per IP. |
| GET    | `/api/records/:id/history` | —                                                     | Full edit history via `git log --follow`. Array of `{ hash, authorName, authorEmail, date, message }`, newest first. |

### Git attribution (v0.8)

`POST /sessions`, `PUT /records/:id`, and `DELETE /records/:id` each commit
their change to the agentic-repo, attributed to the logged-in user (not the
machine's own git identity). `--author "<git_name> <git_email>"` is set from
the user's row in the `users` table; the **committer** stays whatever this
machine's local `git config` already is — that split is intentional, so
individual users never need git configured on the machine running the
server. A record's edit + any `build_index.py`-regenerated index files land
in **one atomic commit**, not two.

`PUT` additionally stamps `last_edited_by` / `last_edited_at` directly into
the record's frontmatter, for fast display without a git call, and both
fields are returned by `GET /records`/`GET /records/:id` as well (via a
shared `_edit_fields()` helper in `build_search_ui.py`, applied across all
five record-loader functions — raw, findings, components, analytics, and
deliverables). Both fields default to `null` for a record that's never been
edited via `PUT`, keeping every record's JSON shape identical either way.
One caveat: component records are regenerated from `tokens.tokens.json`, so
a `PUT` edit's attribution there would be lost the next time that
regeneration runs.

**Route pattern note:** because a record id can contain a slash (any
deliverable id, e.g. `deliverable:personas/foo`), `GET`/`PUT`/`DELETE
/records/:id` and `GET /records/:id/history` use Express 5's named wildcard
(`*splat`) rather than a plain `:id` param, and parse the id out of
`req.path` directly. The `/history` route must stay registered *before* the
generic `/records/*splat` route — Express matches top-down, and the
wildcard would otherwise swallow `/history` as part of the id.

**`POST /api/sessions` fields:**

- **`mode: "raw"`** — `title, type, topicSlug` required; optional `tags`, `relatedComponents`, `relatedFindings`, `researcher`, `methodLabel`, `date`, `content` (full markdown body — overrides the default TODO-scaffold template entirely if given)
- **`mode: "deliverable"`** — `folder, title, slug` required; optional `tags`, `relatedFindings`, `date`, `status`, `sourceType`, `protoType`, `description`. Always runs with `--no-prompt` since the API can't answer interactive prompts.
- **`topicSlug` (raw mode) and `slug` (deliverable mode) must match ****`^[a-z0-9-]+$`**** — rejected with ****`400`**** otherwise.** Both values end up building a filesystem path inside `new_research_session.py`, which does no sanitization of its own; adversarial testing confirmed a `../`-chain payload could write real files outside the intended folder entirely, and an absolute path could discard the base path completely. This validation happens in `records.js`, before either value ever reaches the Python script.

**PUT/DELETE behavior:** no Python script exists for editing or deleting
records, so these two routes read/write/delete the markdown file directly in
Node (using `gray-matter` for frontmatter), then shell out to
`build_index.py` to refresh the generated indexes. **The git commit always
happens once the file write itself succeeds, regardless of what
`build_index.py` does afterward** — an earlier version only committed inside
`build_index.py`'s success path, meaning any reindex failure (a warning *or*
a crash) silently skipped the commit entirely, even though the real file
change was already saved to disk. If `build_index.py` reports an issue, the
response is still `200`/`204` with a `warning` field, but that's now purely
informational — it never affects whether the change gets committed.

**Frontmatter dates stay plain dates.** `gray-matter`'s underlying YAML
library silently upgrades a plain `date: 2025-01-14` frontmatter value into
a full JS `Date` object on parse, then re-serializes it as a full ISO
timestamp (`2025-01-14T00:00:00.000Z`) on every `PUT` — even edits that never
touch `date` at all. `PUT` now detects any `Date`-instance frontmatter field
right before writing and coerces it back to a plain `YYYY-MM-DD` string, so
an edit to, say, just `status` doesn't silently rewrite an unrelated field's
format.

**Raw sessions are two files, not one.** `new_research_session.py` creates
`session-notes.md` and `participants.md` together in one dated folder.
`DELETE` is folder-aware: for a `kind: raw` record it removes the whole
session folder (`fs.rm(..., { recursive: true })`), not just
`session-notes.md` — an earlier version only deleted the one file and
silently orphaned `participants.md`; this is now fixed and covered by
testing.

Auth uses signed, httpOnly session cookies (via `express-session` +
`better-sqlite3-session-store`) — not JWT. Test with `curl` using `-c
cookies.txt` / `-b cookies.txt` to persist the cookie across requests.

## Security notes

- Passwords hashed with `bcrypt` (cost factor 12)
- Session ID regenerated on login/signup (prevents session fixation)
- Cookies: `httpOnly`, `sameSite: lax`, `secure` in production
- Auth is hand-rolled (`express-session` + `bcrypt`), not a library — Lucia
  Auth was originally considered but is deprecated as of March 2025
- Session store uses `better-sqlite3-session-store`, not `connect-sqlite3`,
  to avoid a vulnerable `sqlite3`/`node-gyp`/`tar` dependency chain
- All `/api/sessions` and `/api/records` routes require an authenticated
  session
- `topicSlug`/`slug` are validated against `^[a-z0-9-]+$` before ever
  reaching `new_research_session.py`, preventing path traversal (see above)
- `app.js` includes a generic JSON error-handling middleware — any error
  (a `413` from an oversized body, a malformed-JSON `SyntaxError`, or
  anything else) responds with a plain `{ error: ... }` message and never a
  stack trace, regardless of `NODE_ENV`
- Demo mode (`DEMO_MODE=true`) closes `/signup` and password-based login for
  the three demo identities entirely; the only way in is
  `POST /demo-login`, validated against a fixed, hardcoded username
  allowlist server-side and covered by its own IP-based rate limiter
- A dedicated adversarial test suite (`tests/security.test.js`) exercises
  path traversal, SQL injection, oversized bodies, tampered cookies, and
  XSS directly against the running app — see the Testing section above
- `helmet` sets standard security headers (CSP, `X-Frame-Options`,
  `X-Content-Type-Options`, HSTS, etc.) on every response
- `robots.txt` disallows all crawling, since this is a portfolio-facing demo
  deploy rather than something meant to be indexed
- `POST /sessions`, `PUT /records/*`, and `DELETE /records/*` are rate
  limited (30 requests / 15 min per IP, in-memory) via a shared
  `middleware/rateLimiter.js` — separate from the stricter login/demo-login
  limiters noted above, since these guard the actual write endpoints rather
  than auth attempts
- HTTPS is fully live in production, terminated at Cloudflare's edge in
  front of the host. `trust proxy` (production only) is set to the host's
  own proxy address plus Cloudflare's published IP ranges (`proxyTrust.js`),
  so `req.ip` and `req.secure` reflect the real visitor rather than the last
  hop. The app's own HTTP→HTTPS redirect (`middleware/httpsRedirect.js`)
  stays off by default (`HTTPS_REDIRECT=false`) since Cloudflare's edge
  already enforces HTTPS — see `.env.production.example` for when to turn it
  on instead
- `middleware/hostCheck.js` rejects any request whose `Host` header isn't in
  `ALLOWED_HOSTS` with `421`, registered before every other middleware so
  nothing downstream ever acts on a hostname the app doesn't own
