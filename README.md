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
│   │   └── auth.js   Signup / login / logout / me
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
Then generate a session secret and paste it into `.env`:
```bash
openssl rand -base64 32
```
`.env` should end up looking like:
```
PORT=3001
NODE_ENV=development
SESSION_SECRET=<paste the generated value here>
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

## API (v0.6 — auth only)

No content endpoints exist yet. Current scope is proving login works
end-to-end before building file CRUD in v0.7.

| Method | Path                | Body                                                   | Notes                                  |
|--------|---------------------|---------------------------------------------------------|-----------------------------------------|
| POST   | `/api/auth/signup`  | `username, password, gitName, gitEmail`                | Creates user, starts a session          |
| POST   | `/api/auth/login`   | `username, password`                                    | Rate-limited: 5 attempts / 15 min       |
| POST   | `/api/auth/logout`  | —                                                         | Destroys the session                    |
| GET    | `/api/auth/me`      | —                                                         | Returns current user or 401             |

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

## Roadmap

Continues the version numbering from the original research repo (v0.1–v0.5
shipped there). Full roadmap tracked in Notion: **Version Milestone Roadmap —
Research Repo CRUD UI**.

- [x] v0.6 — Backend Foundation (auth, sessions, no content endpoints)
- [ ] v0.7 — File CRUD API
- [ ] v0.8 — Git Attribution Layer
- [ ] v0.9 — React Frontend: Auth + Browse
- [ ] v1.0 — React Frontend: Create/Edit/Delete
- [ ] v1.1 — Deploy + Polish
