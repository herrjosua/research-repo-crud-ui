# Decision log

Short notes on why the project works the way it does. Newest decisions are
at the bottom. Status as of 2026-09-28.

## 1. Run the LLM locally with Ollama first

**Decision:** Ask the Repo runs on Ollama on the developer's machine:
`gemma2:9b` for answers and `nomic-embed-text` for embeddings. Ollama was
installed without creating an Ollama account.

**Why:** No cost, no research data leaving the machine, and it works
offline. `gemma2:9b` was chosen over the larger Qwen 2.5 14B because the
corpus is English-only (so the multilingual strength isn't needed) and the
smaller model answers faster on ordinary hardware.

**Kept open:** AWS Bedrock as a later option for a hosted demo. The
`LLM_PROVIDER` switch is in place, but only the `ollama` branch exists.

## 2. Brute-force similarity search, no vector database

**Decision:** Compare the question against every passage with cosine
similarity.

**Why:** The corpus is about 500 passages; a vector database would add
infrastructure for no visible benefit. Revisit if the corpus grows by
orders of magnitude.

## 3. Embeddings cached in memory, keyed by passage text

**Decision:** No work at startup. Embeddings are built on the first
question and reused, keyed by a hash of each passage's text.

**Why:** The server starts instantly and doesn't need Ollama running until
someone asks a question. Edited records re-embed only their changed
passages, with no cache-clearing code.

**Tradeoff:** The first question is slow (about 9 seconds cold), and the
cache is lost on restart.

## 4. Project filter works by tag

**Decision:** `/api/ask` filters by tag, not by a project field.

**Why:** Records don't have a project field. agentic-repo gives every
record exactly one `project-*` tag (listed in its `research/projects.yml`),
so a tag is a real, single-valued grouping.

**Now:** The Ask tab's project picker lists those tags from
`GET /api/ask/config`, with their labels and record counts, after an
"All projects" entry that searches everything. Picking one sends its full
tag as the filter.

## 5. Raw sessions are append-only; corrections are new files

**Decision:** A wrong fact in a raw session is fixed by adding a
`correction-*.md` file next to it, never by editing `session-notes.md`.

**Why:** Raw notes are the tie-breaker when other records disagree. Editing
them would weaken the rule every other fix relies on.

**Known gap:** The export scripts don't read correction files, so retrieval
can still surface the uncorrected fact.

## 6. Saved insights come from cited sources only

**Decision:** The Saved Insights tab is fed only by "Save as insight" on a
cited source. The existing "Save as deliverable" action on a whole reply
stays a separate pipeline.

**Why:** An insight is one pinned, cited source. A deliverable is a whole
assistant reply headed for a draft/final review. Keeping them
separate keeps that distinction clear.

**Consequence:** Insights hold real cited passages (up to about 600
characters), so long ones collapse behind "Show more".

## 7. Model output is rendered as plain text

**Decision:** The backend strips HTML and unwraps markdown before returning
an answer, and the frontend shows it as text.

**Why:** Model output is untrusted. This was cheap to do now; the fuller
output-safety work stays on the roadmap.

## 8. The corpus is fictional, so problems are fixed by authoring

**Decision:** When demo records contradict each other or leave a gap, we
write the correction directly instead of deferring to a real person. Edits
happen in the real `agentic-repo` checkout.

**How we found problems:** We asked `/api/ask` 51 questions across three
rounds and read the citations for blended or conflicting sources, using the
raw session notes as the tie-breaker. The log is
`docs/ask-audit-2026-09-27.md` in agentic-repo.

**Why the dev clone exists:** On 2026-09-22, local Playwright runs deleted
seven demo sessions from the real checkout. E2E now runs against a throwaway
repo, and local app use points at a push-disabled clone,
`agentic-repo-dev`.

## 9. The Chromatic check blocks on unreviewed visual diffs

**Decision:** Chromatic's **UI Tests** check is a required check on `main`.
It stays pending, and blocks the merge, while any visual or accessibility
change in a pull request's build is unaccepted, and turns green on its own
once every change is accepted. The CI workflow's `chromatic` job only builds
and publishes Storybook; it isn't the gate.

**Why:** The CI job passed even with unreviewed changes in the build,
so it couldn't gate merges. Chromatic's own checks weren't posting on pull
requests because the Chromatic project wasn't linked to the GitHub
repository. Linking it made UI Tests (and the non-required Storybook
Publish) post on every pull request.

**Status:** Proven on a real pull request against new stories, against
changes to already-approved stories, and against a rejected change, which
turns UI Tests red and keeps the merge blocked. Accepting every change
clears the gate on its own, with no job re-run, and a build with no
changes posts UI Tests and passes on its own.

## 10. Styling follows Carbon; overrides go through the theme layer

**Decision:** Use core Carbon theme values. Any override goes through the
theme SCSS layer (for example the teal primary), not hardcoded in a
component. Prefer out-of-the-box Carbon components, and build any custom
component so it survives a Carbon upgrade. Everything must pass color
contrast checks.

**Why:** Keeps the UI upgradeable and accessible. Where a custom component
compensates for Carbon internals (for example small-button padding), it's
commented and should be re-checked after any Carbon upgrade.

## 11. Conversation history is session-only

**Decision:** The Ask tab starts with no conversations. Asking from the
empty state starts one, titled by its first question; conversations live in
the page's state and are gone when the user leaves the page.

**Why:** Nothing stores conversations yet, and showing seeded examples
would suggest otherwise. This matches Saved Insights, and the rail says
"Session only" in the same words.

**Consequence:** Each question is also answered on its own (the endpoint
has no memory of earlier ones), and the composer says so.

## 12. Picking a project doesn't include cross-cutting records

**Decision:** A project filter matches that project's own tag only.
Cross-cutting records are searched under "All projects", or by picking
"Cross-cutting", which is listed as a project of its own.

**Why:** There are 25 cross-cutting records against 3 to 21 for each
project. Ranking keeps the top 6 records per question, so mixing them in
would crowd out the project's own records. Including them would take a
backend change (accept a list of tags and match any of them).

## 13. The public demo uses pre-generated answers, picked from a list

**Decision:** The public demo runs with `LLM_PROVIDER=static`. Visitors pick
from a curated list of questions whose answers were captured ahead of time
from the local model; nothing can be typed. The answers are unedited model
output, and the page says when and with which model they were generated.

**Why:** The demo server can't run a model, and a hosted model would add
cost, a data path outside the machine, and abuse to guard against. A picker
still shows the real product: citations, sources and insights work exactly
as they do live. Matching typed questions to the nearest captured one was
ruled out, because a near match answers a different question than the one
asked. Pre-generated answers are only honest if they say so and have no
fake delay or typing effect, so neither is simulated.

**Consequence:** Answers can drift from the corpus they quote. The capture
script's `verify` command checks every cited record and excerpt against a
clone, and the answers are recaptured when the corpus changes a lot.
