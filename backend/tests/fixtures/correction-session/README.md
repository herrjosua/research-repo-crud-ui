# Raw correction fixture

One raw session with an append-only correction file
(`correction-YYYY-MM-DD.md`), for `tests/records.test.js`. agentic-repo's
`export_records.py` (from `fix/v0.5.28-RR-97-correction-files` on) appends a
correction to the session's `html` under a "Correction (YYYY-MM-DD)"
heading and lists it in `corrections`; `rawContent` is `session-notes.md`
alone, so editing the record never writes a correction into the notes.
