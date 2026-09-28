# E2E fixture corpus

`corpus/` is copied into a throwaway git repo for every Playwright run (see
`support/start-backend.js`), so E2E never touches a real agentic-repo.
The tests delete records, so each run starts from this fresh copy.

Copied once from agentic-repo's public demo content at aedfe7b:
8 raw sessions, one finding plus the tag glossary, one generated design-token
component (read-only in the UI), and one persona deliverable. Raw sessions list
first in the dashboard, so the first tile is always a deletable raw session.

`static-demo/` and `static-answers.json` are for the demo config only
(`LLM_PROVIDER=static`). `static-demo/research/projects.yml` is copied over
`corpus/` so the Ask tab has projects to filter by: two raw sessions get
their own projects, the rest fall under Cross-cutting, and Onboarding has no
questions. `static-answers.json` is in the backend's answers-file format;
its excerpts are real passages of this corpus, so
`backend/scripts/capture-static-answers.js verify --answers` passes against
it. Its answers are written for the tests, not captured from a model.
