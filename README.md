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
├── docs/       deploy.md (the deploy runbook), architecture.md (how the pieces fit together), and decisions.md (the decision log)
├── .github/workflows/   ci.yml (see CI below) and deploy.yml (tag-triggered CD, see docs/deploy.md)
├── LICENSE
└── .gitignore
```

## Documentation

Every tracked doc. "Checked" means re-read against the repo on that date;
"partly checked" means only the sections named were. The other docs
haven't been re-checked since the date of their last commit.

| Doc | Purpose | Status |
|---|---|---|
| [`README.md`](./README.md) | Overview, setup pointers, repos, CI, roadmap, versioning | Checked against repo 2026-09-30 |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Chromatic visual review and Storybook story rules | Not re-verified (last commit 2026-09-29) |
| [`docs/architecture.md`](./docs/architecture.md) | How the pieces fit together; Ask the Repo's request flow, static mode and known gaps | Checked against repo 2026-09-30 |
| [`docs/decisions.md`](./docs/decisions.md) | The decision log | Checked against repo 2026-09-30 |
| [`docs/deploy.md`](./docs/deploy.md) | Deploy runbook: `deploy.sh`, the tag-triggered workflow, the deploy key | Checked against repo 2026-09-30 |
| [`backend/README.md`](./backend/README.md) | Backend setup, env vars, Ask the Repo setup and evaluation, API reference | Partly checked 2026-09-30 (intro and agentic-repo link, Python path note, the milestone line, Ask the Repo latency and passage counts, Auth and Records API tables, lead role, the HTTPS security note); rest not re-verified (last commit 2026-09-30) |
| [`frontend/README.md`](./frontend/README.md) | Frontend setup, testing, Storybook, stack decisions | Partly checked 2026-09-30 (milestone status, project structure's `api/` and `ask-the-repo/` entries, v1.2 section); rest not re-verified (last commit 2026-09-29) |
| [`frontend/CLAUDE.md`](./frontend/CLAUDE.md) | Frontend theming and component conventions | Not re-verified (last commit 2026-09-28) |
| [`frontend/src/ask-the-repo/TOKEN_MAPPING.md`](./frontend/src/ask-the-repo/TOKEN_MAPPING.md) | How the Ask the Repo design's tokens map to Carbon | Partly checked 2026-09-30 (why it lives there); rest not re-verified (last commit 2026-09-28) |
| [`e2e/README.md`](./e2e/README.md) | End-to-end and accessibility tests: setup and findings | Not re-verified (last commit 2026-09-29) |
| [`e2e/fixtures/README.md`](./e2e/fixtures/README.md) | The e2e fixture corpus | Not re-verified (last commit 2026-09-28) |
| [`backend/tests/fixtures/projects-corpus/README.md`](./backend/tests/fixtures/projects-corpus/README.md) | The project-tagging test corpus | Not re-verified (last commit 2026-09-28) |
| `backend/ask/eval/results/*.md` | Generated evaluation reports (`scripts/eval-ask.js`) | Generated, not hand-edited (last commit 2026-09-30) |

The other markdown files under `e2e/fixtures/corpus/` and
`backend/tests/fixtures/projects-corpus/` are fictional test records, not
docs.

## Getting started

This is a two-part app — the backend must be running before the frontend can
do anything useful (it proxies all `/api` calls to it in dev). Start with
[`backend/README.md`](./backend/README.md) for setup, then
[`frontend/README.md`](./frontend/README.md).
Storybook, for working on components without the backend, is covered in
[`frontend/README.md`](./frontend/README.md#storybook).

You also need a checkout of the agentic-repo with its Python environment
(`requirements.txt`, Python 3.13). The backend requires `AGENTIC_REPO_ROOT`
and `PYTHON_BIN` in `backend/.env` and refuses to start without
`AGENTIC_REPO_ROOT`. The tests only read the Python scripts from it: they use
`REAL_AGENTIC_REPO_ROOT` if set, otherwise an `agentic-repo` folder next to
this repo.

Ask the Repo runs on a local [Ollama](https://ollama.com); setting it up,
along with the push-disabled dev clone of agentic-repo to point the backend
at, is covered in [`backend/README.md`](./backend/README.md#ask-the-repo-local-ollama).
For how the pieces fit together, see
[`docs/architecture.md`](./docs/architecture.md).

## Repos and how they fit

- **[agentic-repo](https://github.com/herrjosua/agentic-repo)** (public) is
  the source of truth for the research corpus: the markdown records and the
  Python scripts this app runs (`export_records.py`, `build_index.py` and
  others). Set it up, including its Python environment, with its
  [`docs/SETUP.md`](https://github.com/herrjosua/agentic-repo/blob/main/docs/SETUP.md).
  Corpus edits are made in your own agentic-repo checkout, never through
  this app's dev clone.
- **A push-disabled dev clone** of agentic-repo is what the app reads and
  writes. `AGENTIC_REPO_ROOT` in `backend/.env` points at it. The app
  commits every create, edit and delete to whatever repo that variable
  names, so never point it at your real checkout. Setting up the clone is
  covered in [`backend/README.md`](./backend/README.md); the incident that
  led to it is in
  [decision 8](./docs/decisions.md#8-the-corpus-is-fictional-so-problems-are-fixed-by-authoring).
- **The public demo's corpus** is a private demo repo, kept in step with
  agentic-repo by a sync workflow in agentic-repo. Nothing in this repo
  configures either.
- **The static answers** the public demo serves
  (`backend/ask/static/answers.json`) quote corpus records by id and were
  captured against one agentic-repo commit (`metadata.corpusCommit`).
  Changing the corpus can make them wrong, so check them with
  `capture-static-answers.js verify` after corpus changes, and recapture
  when cited records change: see
  [`backend/README.md`](./backend/README.md#static-answers-for-the-public-demo-llm_providerstatic).

Automated tests use none of these: they copy agentic-repo's scripts into a
throwaway repo (see [Testing](#testing)).

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
and pull request to `main`, as five jobs:

- **frontend**: `npm ci`, `npm run lint`, the Vitest suite and
  `npm run build` on Node 24, then a check that the production build
  contains no trace of the dev-only provider toggle.
- **backend**: checks out
  [`herrjosua/agentic-repo`](https://github.com/herrjosua/agentic-repo)
  (`main`) for the Python scripts the tests copy, installs its
  `requirements.txt` on Python 3.13, and runs the Jest suite.
- **deploy-script**: shellcheck on `deploy.sh`, `ssh-retry-classify.sh`, and
  their tests, then `scripts/tests/deploy.test.sh` (runs `deploy.sh` against
  a throwaway checkout and a fake process manager) and
  `scripts/tests/ssh-retry-classify.test.sh` (the SSH connection-failure
  classifier the CD workflow uses to decide whether to retry).
- **chromatic**: builds Storybook and publishes it to Chromatic. It isn't
  the merge gate: Chromatic's own **UI Tests** check, a required check,
  blocks merge while any visual or accessibility change is unaccepted —
  see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how changes get reviewed.
- **e2e**: both Playwright configs, as two matrix legs (`e2e (main)` and
  `e2e (demo)`) so a failure in one never hides the other. Each sets up
  agentic-repo and Python like the backend job, installs Chromium only, and
  runs `npm test` or `npm run test:demo`, whose own `webServer` settings
  start the frontend and a backend on a throwaway repo. On failure, the HTML
  report and traces are uploaded as the `playwright-main` or
  `playwright-demo` artifact.

Branch protection on `main` requires seven status checks, and requires a
branch to be up to date with `main` before it merges:

- from GitHub Actions, the six check names these five jobs produce:
  `backend`, `frontend`, `chromatic`, `deploy-script`, `e2e (demo)` and
  `e2e (main)`;
- **UI Tests**, Chromatic's own status (accepted from any source).

The protection settings themselves live in GitHub, not in this repo; this
list is as of 2026-09-30.

## Production

With `NODE_ENV=production`, one Node process serves both the API and the built
frontend (`frontend/dist`, from `npm run build` in `frontend/`), with
client-side routes falling back to `index.html`; the backend won't start if
the build is missing. Every production setting is listed, with comments, in
[`backend/.env.production.example`](./backend/.env.production.example),
including:

- **Proxy trust** for traffic arriving through the edge proxy and the
  host's proxy: the host proxy's address (`TRUST_PROXY`, default
  `loopback`) plus the edge's published IP ranges in
  [`backend/proxyTrust.js`](./backend/proxyTrust.js), which lists
  Cloudflare's, so the rate limiters see the real visitor IP.
- **`ALLOWED_HOSTS`**: requests for any other hostname get `421`.
- **`HTTPS_REDIRECT`**: the app's own HTTP→HTTPS redirect, off in the example
  for an edge proxy that already enforces HTTPS.

How the public host and its edge proxy are configured lives outside this
repo.

`GET /api/health` returns `{ status, version, startedAt }` with
`Cache-Control: no-store`, after checking the database answers.

### Deploy

Pushing a `vX.Y.Z` tag on `main` triggers
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml): after
confirming the tag's commit is on `main`'s history (so branch protection
and the required checks above applied to it), the job
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
shipped there). These are milestones, not release numbers: see
[Versioning and releases](#versioning-and-releases) for how they relate to
tags.

- [x] v0.6 — Backend Foundation (auth, sessions)
- [x] v0.7 — File CRUD API (sessions, records)
- [x] v0.8 — Git Attribution Layer
- [x] v0.9 — React Frontend: Auth + Browse
- [x] v1.0 — React Frontend: Create/Edit/Delete
- [x] v1.1 — Testing (Unit + QA)
- [x] v1.2 — Deploy + Polish, including the first release tags (v1.2.6 to
  v1.2.10) and the tag-triggered deploy
- [ ] v1.3 — Agentic LLM Layer (local, Ollama). In progress.
  - [x] **Ask the Repo**, released as v1.3.6: questions answered from the
    corpus with cited sources, by a local model. The same release has the
    **static public-demo mode**: the public demo runs no model and serves
    pre-generated answers to a curated list of questions
    ([decision 13](./docs/decisions.md#13-the-public-demo-uses-pre-generated-answers-picked-from-a-list)).
  - Merged since v1.3.6, not yet released: the **dev-only provider toggle**,
    which switches a dev server between static and live answers without a
    restart and is absent from production builds
    ([decision 14](./docs/decisions.md#14-a-dev-only-switch-between-static-and-live-answers));
    the answer-evaluation harness and its gold sets; the retrieval changes
    in [decision 15](./docs/decisions.md#15-retrieval-changes-for-raw-session-evidence);
    and the local chat-model comparison in
    [decision 16](./docs/decisions.md#16-gemma29b-stays-the-chat-model-after-a-local-bake-off-v13631).
  - [ ] Per-record synthesis assistance
  - [ ] Document ingestion
- [x] v1.4 — Storybook and Chromatic visual testing. Shipped: merged before
  v1.3's first release and released with v1.3.6. See
  [`frontend/README.md`](./frontend/README.md#storybook) and
  [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Versioning and releases

- **Version labels are milestones.** Labels such as v1.3 or v1.3.6.31 order
  planned work and name branches (`feature/v1.3.6.31-…`). A label isn't a
  release number, and most labels never become a tag.
- **Release tags are `vMAJOR.MINOR.PATCH`**, cut in release order.
  Before tagging, the `version` in both `backend/package.json` and
  `frontend/package.json` must equal the tag without its `v`: `deploy.sh`
  refuses a tag whose versions don't match.
- **A tag starts the deploy.** Pushing a tag that matches `v*.*.*` runs
  [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). Its
  `verify` job refuses any tag that isn't exactly
  `^v[0-9]+\.[0-9]+\.[0-9]+$` (so a four-part label pushed as a tag starts
  the workflow and then fails) and any tag whose commit isn't on `main`.
  The `deploy` job then waits for approval in the `production` environment.
  See [`docs/deploy.md`](./docs/deploy.md#deploying-from-github-actions).
- **Tags are annotated from now on:** `git tag -a vX.Y.Z`.
- **Six tags so far:** v1.2.6, v1.2.7, v1.2.8, v1.2.9, v1.2.10 and v1.3.6.
  v1.2.6 to v1.2.9 are lightweight tags; v1.2.10 and v1.3.6 are annotated.
  Earlier work (v0.6 to v1.1, and v1.2 before v1.2.6) shipped before
  tagging began.
- **"Shipped" means released**: a tag exists and it's deployed. Work merged
  to `main` but not yet tagged is "merged". See
  [decision 17](./docs/decisions.md#17-release-versioning).

## AI-Assisted Development

This project was built by Joshua Bock with AI assistance from Claude — used both as the AI agent this tooling is designed to work with, and as a development collaborator throughout the build (planning, implementation, testing, and code review), under direct human review and direction at every step.

## License

MIT — see [LICENSE](LICENSE).

