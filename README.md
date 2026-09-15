# Research Repo CRUD UI

A multi-user web app that adds a full CRUD interface, login, and git-based edit
attribution on top of the [Agentic UX Research Repo](../agentic-repo) (a
separate repo — this app reads/writes its markdown content but is not stored
inside it, to avoid risking that repo's working content).

**Stack:** React frontend, Node/Express backend, SQLite for user accounts and
sessions only (markdown files remain the source of truth for research
content).

## Project structure

```
Research Repo CRUD UI/
├── backend/          Node/Express API
│   ├── server.js     Entry point — session middleware, route mounting
│   ├── db.js         better-sqlite3 connection + users table schema
│   ├── routes/
│   │   ├── auth.js      Signup / login / logout / me
│   │   └── records.js   Sessions + file CRUD (shells out to agentic-repo's Python scripts)
│   ├── .env.example  Template for required environment variables
│   └── app.db        SQLite file (git-ignored, created on first run)
├── frontend/         React app (not yet built — starts in v0.9)
└── .gitignore
```

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

**`POST /api/sessions` fields:**

- **`mode: "raw"`** — `title, type, topicSlug` required; optional `tags`, `relatedComponents`, `relatedFindings`, `researcher`, `methodLabel`, `date`
- **`mode: "deliverable"`** — `folder, title, slug` required; optional `tags`, `relatedFindings`, `date`, `status`, `sourceType`, `protoType`, `description`. Always runs with `--no-prompt` since the API can't answer interactive prompts.

**PUT/DELETE behavior:** no Python script exists for editing or deleting
records, so these two routes read/write/delete the markdown file directly in
Node (using `gray-matter` for frontmatter), then shell out to
`build_index.py` to refresh the generated indexes. If `build_index.py`
reports an issue (e.g. an undocumented tag), the response is still `200`/`204`
with a `warning` field — the file operation itself already succeeded, so a
downstream index warning doesn't roll it back.

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

## Roadmap

Continues the version numbering from the original research repo (v0.1–v0.5
shipped there). Full roadmap tracked in Notion: **Version Milestone Roadmap —
Research Repo CRUD UI**.

- [x] v0.6 — Backend Foundation (auth, sessions)
- [x] v0.7 — File CRUD API (sessions, records)
- [ ] v0.8 — Git Attribution Layer
- [ ] v0.9 — React Frontend: Auth + Browse
- [ ] v1.0 — React Frontend: Create/Edit/Delete
- [ ] v1.1 — Deploy + Polish
