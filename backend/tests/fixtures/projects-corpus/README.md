# Project-tagging fixture corpus

A tiny corpus with a `research/projects.yml`, so `tests/projectTags.test.js`
runs with agentic-repo's project tagging on (see its `docs/projects.md`).
Every other backend test and the e2e corpus have no `projects.yml`, which
turns project tagging off, so they are unaffected by this folder.

One record of each editable kind, all in `project-onboarding`: a raw session
(mapped in `projects.yml`), a finding, an analytics summary, and a persona
deliverable (each tagged in its own frontmatter). `build_index.py` passes on
it as committed.
