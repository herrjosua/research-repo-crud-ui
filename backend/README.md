# Research Repo CRUD UI — Backend

Node/Express API for the CRUD UI. Handles auth, session management, and all
file CRUD against the [Agentic UX Research Repo](../../agentic-repo) by
shelling out to its Python scripts (and, where no script exists, editing
markdown files directly).

**Stack:** Express, `better-sqlite3` (users + sessions only — markdown files
remain the source of truth for research content), `express-session` +
`bcrypt` for auth, `gray-matter` for frontmatter parsing, Jest + supertest
for testing.

v0.6–v1.1 are complete (backend foundation through testing); v1.2 (Deploy +
Polish) is next. See the Version Milestone Roadmap in Notion for full detail
and decision rationale.

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
cd /Users/joshuacbock/IdeaProjects/agentic-repo
source .venv/bin/activate
which python3
```
`.env` should end up looking like:
```
PORT=3001
NODE_ENV=development
SESSION_SECRET=<paste the generated value here>
AGENTIC_REPO_ROOT=/Users/joshuacbock/IdeaProjects/agentic-repo
PYTHON_BIN=/Users/joshuacbock/IdeaProjects/agentic-repo/.venv/bin/python3
```
**Never commit `.env`** — it's already covered by `.gitignore`.

### 3. Run the server
```bash
cd backend
node server.js
```
You should see `Server listening on http://localhost:3001`. The SQLite
database file (`app.db`) and its tables are created automatically on first
run.

> **Note:** `server.js` lives in `backend/`, not the repo root. Running
> `node server.js` from anywhere else will fail with `MODULE_NOT_FOUND`.

## Testing

```bash
npm test
```

Runs the full Jest + supertest suite. Coverage:

- **`tests/auth.test.js`** — signup, login, logout, `/me`, and the rate
  limiter (including the 6th attempt still being blocked even with the
  correct password).
- **`tests/records.test.js`** — `POST /sessions` (raw mode), `GET
  /records`/`GET /records/:id`, `PUT /records/:id` (including the
  gray-matter date-coercion fix), `DELETE /records/:id` (including the
  raw-session-is-two-files case), and `GET /records/:id/history` (including
  `--follow` lineage across a delete-then-recreate under the same slug).

**Records tests never touch the real agentic-repo.** They run against a
disposable, git-initialized fixture repo created fresh per test run (see
`tests/helpers/setupTestRepo.js`), seeded by copying the actual Python
scripts (`new_research_session.py`, `export_records.py`, `build_index.py`,
`build_search_ui.py`, `md_render.py`) from the real agentic-repo — so tests
always exercise the current real script logic, never a stale duplicate, with
zero risk to real research content or git history. This mirrors the same
isolation principle as the public demo's separate-repo strategy (see the
Decision Log), just scoped down to a local, throwaway fixture instead of a
persistent synced GitHub repo.

**Test/dev database separation.** `db.js` and `app.js` both branch on
`NODE_ENV=test` (set automatically by Jest) to use a SQLite file scoped to
the current Jest worker (`app.test.<JEST_WORKER_ID>.db`) instead of the real
`app.db` — this prevents two test files running in separate worker
processes from racing on the same file (e.g. one file's per-test table wipe
deleting another file's test user mid-run).

## Project structure

```
backend/
├── server.js     Entry point — imports app.js, starts listening
├── app.js        Express app definition (middleware, routes) — exported separately from server.js so tests can import it directly via supertest, without a real port
├── db.js         better-sqlite3 connection + users table schema (test/prod db split via NODE_ENV)
├── routes/
│   ├── auth.js      Signup / login / logout / me
│   └── records.js   Sessions + file CRUD (shells out to agentic-repo's Python scripts)
├── tests/
│   ├── auth.test.js      Auth flow + rate limiting tests
│   ├── records.test.js   Records CRUD + history tests
│   └── helpers/
│       └── setupTestRepo.js   Creates/destroys the disposable fixture repo used by records.test.js
├── .env.example  Template for required environment variables
└── app.db        SQLite file (git-ignored, created on first run; app.test.*.db files are the test-only equivalent)
```

## API

All routes below require a logged-in session (`401` otherwise).

### Auth (v0.6)

| Method | Path                | Body                                      | Notes                              |
|--------|---------------------|--------------------------------------------|--------------------------------------|
| POST   | `/api/auth/signup`  | `username, password, gitName, gitEmail`   | Creates user, starts a session       |
| POST   | `/api/auth/login`   | `username, password`                       | Rate-limited: 5 attempts / 15 min    |
| POST   | `/api/auth/logout`  | —                                            | Destroys the session                 |
| GET    | `/api/auth/me`      | —                                            | Returns current user or 401          |

### Records / File CRUD (v0.7)

| Method | Path                    | Body / Query                                          | Notes                                                       |
|--------|-------------------------|---------------------------------------------------------|-----------------------------------------------------------------|
| POST   | `/api/sessions`         | `{ mode: "raw" \| "deliverable", ... }`                | Wraps `new_research_session.py`. See field reference below.     |
| GET    | `/api/records`          | `?kind=raw\|finding\|component\|analytics\|deliverable` | Shells out to `export_records.py`. `kind` filter optional.       |
| GET    | `/api/records/:id`      | —                                                        | Single record by id (e.g. `raw:2026-09-15-foo`). 404 if not found. |
| PUT    | `/api/records/:id`      | `{ frontmatter?: {...}, content?: "..." }`             | Merges frontmatter, replaces content if given. Reruns `build_index.py`. |
| DELETE | `/api/records/:id`      | —                                                        | Deletes the file (whole session folder for `kind: raw`). Reruns `build_index.py`. 204 on success. |
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
the record's frontmatter, for fast display without a git call. **Known gap
(see Decision Log):** this is written correctly to the file but not
currently returned by `GET /records`/`GET /records/:id`, since the record
shape those endpoints return (defined in `build_search_ui.py`'s loader
functions) doesn't include those two fields.

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
