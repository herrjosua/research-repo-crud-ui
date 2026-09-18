# Research Repo CRUD UI

A multi-user web app that adds a full CRUD interface, login, and git-based edit
attribution on top of the [Agentic UX Research Repo](../agentic-repo) (a
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
└── .gitignore
```

## Getting started

This is a two-part app — the backend must be running before the frontend can
do anything useful (it proxies all `/api` calls to it in dev). Start with
[`backend/README.md`](./backend/README.md) for setup, then
[`frontend/README.md`](./frontend/README.md).

## Testing

Both halves of the app have automated test suites:

- **Backend**: Jest + supertest (`cd backend && npm test`) — covers the auth
  flow (signup/login/logout/rate-limiting, plus demo-mode auth), the records
  CRUD paths (create/read/update/delete, the raw-session-is-two-files edge
  case, git attribution, and edit history), and a dedicated adversarial
  security suite (`tests/security.test.js` — path traversal, SQL injection,
  oversized request bodies, tampered session cookies, and XSS via markdown
  links; found and fixed two real vulnerabilities and one information-leak
  bug along the way). All run against a disposable, git-initialized fixture
  repo rather than the real agentic-repo — see
  [`backend/tests/helpers/setupTestRepo.js`](./backend/tests/helpers/setupTestRepo.js).
- **Frontend**: Vitest + React Testing Library (`cd frontend && npm test`) —
  covers `LoginForm`'s success/error/pending states, `Dashboard`'s kind/tag
  filtering logic, and `DemoUserPicker`'s profile selection and login states.
- **End-to-end + accessibility**: Playwright + axe-core, in two separate
  configs — the regular suite (`cd e2e && npm test`) drives a real browser
  through login → browse → logout and a keyboard-only walkthrough of the
  dashboard/record detail/delete-confirmation dialogs; a second config
  (`npm run test:demo`) exercises the demo user picker specifically, with its
  own backend instance running in demo mode. Both run an automated WCAG 2 AA
  scan (via `@axe-core/playwright`) against every major screen and modal
  state — found and fixed three real accessibility issues along the way,
  including a genuine bug in Carbon's own nested-modal focus handling. See
  [`e2e/README.md`](./e2e/README.md) for setup and the full list of findings.

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
- [ ] v1.2 — Deploy + Polish
- [ ] v1.3 — Agentic LLM Layer (local, Ollama)
- [ ] v1.4 — Enterprise Integration Design (Copilot / SharePoint) — design doc only
