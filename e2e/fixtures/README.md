# E2E fixture corpus

`corpus/` is copied into a throwaway git repo for every Playwright run (see
`support/start-backend.js`), so E2E never touches a real agentic-repo.
The tests delete records, so each run starts from this fresh copy.

Copied once from agentic-repo's public demo content at aedfe7b:
8 raw sessions, one finding plus the tag glossary, one generated design-token
component (read-only in the UI), and one persona deliverable. Raw sessions list
first in the dashboard, so the first tile is always a deletable raw session.
