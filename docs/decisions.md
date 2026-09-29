# Decision log

Short notes on why the project works the way it does. Newest decisions are
at the bottom. Status as of 2026-09-29.

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

**Now:** The Ask tab's project picker lists those tags by label from
`GET /api/ask/config`, after an "All projects" entry that searches
everything. Picking one sends its full tag as the filter. In live mode,
helper text under the picker gives the selected project's record count
("Searches 21 records"). Static mode shows no count, because nothing is
searched there.

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

## 14. A dev-only switch between static and live answers

**Decision:** On a dev server, Ask the Repo's provider can be switched
between `static` and `ollama` at runtime, from a Dev toggle on the Ask page
(`POST /api/dev/provider`). The provider lives in the server process's
memory and starts as `LLM_PROVIDER`; a restart goes back to it. The route
is registered at startup only when `DEV_TOOLS_ENABLED=true` and `NODE_ENV`
is `development` or `test`, and the frontend loads the toggle only under
`vite dev`. With `LLM_PROVIDER` unset the toggle can turn Ask on, but not
off: the endpoint accepts only the two providers.

**Why:** Checking the public demo's static mode against live answers meant
restarting the backend with a different `.env`. The toggle has to be
impossible to reach from the public demo, so it fails closed at every layer:
an allowlist of `NODE_ENV` values rather than "not production" (a deploy
that forgot `NODE_ENV` gets nothing), registration rather than a runtime
permission check (nothing to get wrong per request), and a production build
that doesn't contain it at all (CI checks `dist/`). Switching to `ollama`
first asks Ollama for its model list, so a stopped Ollama or a missing model
fails the switch with a message instead of failing the next question.

**Consequence:** A switch clears the Ask tab's conversations and resets the
project to "All projects". Threads from the other mode can't be told apart
(both answer as `gemma2:9b`) and their retries would be rejected by the new
mode. Saved insights and pins are kept: they're sources, valid in either
mode. Other open tabs keep the old mode until their config refetches.
The toggle deliberately has no Storybook story, an exception to
`frontend/CLAUDE.md` rule 8: it renders only in dev builds and must add no
Chromatic baseline. Its behavior is covered by `DevProviderToggle.test.jsx`
and the production-build check.


## 15. Retrieval changes for raw-session evidence (RR-103)

**Decision:** Ask the Repo labels every source for the model as a
`RAW SESSION`, `SYNTHESIS` or `DOC`, tells it to prefer raw sessions for
quotes and counts and to cite one or two sources per sentence, and keeps
metadata sections out of retrieval: raw rosters (`Participants — <title>`)
and `Related` lists, findings' `Evidence Trail` and `Related Findings`,
components' `Code mapping` and `Related Research Findings`, and a raw
session's heading-less `Researcher: …` line. A raw session's roster reaches
the model as a one-line header on its sources instead. The top 6 records
by their best passage are shown: a raw session with its two best passages
(in record order), anything else with one. A provenance slot and k = 8 were
tried and are off. The final defaults are k = 6, metadata sections
excluded, provenance slot off, `passagesPerRaw: 2`. Details in
`backend/README.md`, "Retrieval".

**Why rosters are excluded:** a roster is a list of role names, so it
matches any question that names a role, and link lists do the same with
record titles. Before this change, 10 of the passages shown to the model
were metadata, on 5 of the 17 gold questions. On the care-coordinator gaps
question, three sessions (the chart-review baseline among them) reached the
model only as their rosters. On the documentation pain-points question,
three of the six records were represented by their link lists. Excluded
sections are still read, so a cited passage keeps its real surrounding text
and the provenance links (below) can use them, but they're never embedded
or ranked (117 of 548 passages). The roster's facts (head count, roles) are
kept as the one-line header, which the answer checks count as evidence.

**How the provenance slot works, and why it's off:** it links a synthesis
or doc record to the raw sessions it was built from, by four kinds of link:
a raw session's `Synthesized into: <slug>.md`, a `raw/<date-slug>` path, a
raw session's exact title in a finding's Evidence Trail, and a raw
session's `related_components`. When none of the top k is a raw session
linked to a shown non-raw record, the best-ranked linked session from below
the cut-off replaces the lowest non-raw record, and is shown last. It never
replaces the only record linking to the session it adds. It changed what
the model saw on 5 of 17 gold questions, gained no passing answer, and
turned `audit-step3-wireframe` from pass to fail in 3 of 3 seeded and 2 of 3
unseeded runs. Given the onboarding session's notes, the model answered
"The question cannot be answered from the provided sources." instead of
saying there is no step 3 wireframe. On the two invite questions it did
bring the onboarding session in, but through its best-scoring passage (its
Participants prose), not the session 3 quote that holds the answer. The slot
picks records, not passages, so the evidence stayed out of view. The code
and its tests stay, so it can be turned on (`RETRIEVAL.provenanceSlot`)
once passage choice is fixed.

**What was measured** (gold set 10 regression + 7 scenario questions, seed 42, temperature 0.2, 3
seeded and 3 unseeded runs each, corpus 4ba145f). Every step was measured
against the one before, and stopped at an entry turning from pass to fail
in the seeded run and at least 2 of 3 unseeded runs. Passes are regression /
scenario, against a baseline of 5 / 0, all judged by the current answer
checks (below). The final step's runs are kept in `backend/ask/eval/results/`
(`v1.3.6.7-step5`, `v1.3.6.7-step5-scenarios`, and `baseline-vs-v1.3.6.7-step5`
for both sets). The intermediate runs and reports (steps 1–4, step 3-off,
and their comparisons) were moved out of the repo to `~/rr103-results/` on
the machine that ran them. The table below summarizes each:

| Step | Change | Passes | Prompt chars, regression mean / max | What flipped |
|---|---|---|---|---|
| 1 | Labels and prompt rules | 5 / 0 | 3,925 / 4,615 (baseline 3,419 / 4,091) | `prior-auth-citations` fail → pass; `scribe-sound-alike-names` pass → fail (the raw session was shown by its Objective, not the Key Findings with the counts) |
| 2 | Metadata sections excluded, roster header | 5 / 0 | 4,025 / 4,999 | none; one more scenario cites a raw session |
| 3 | Provenance slot | 4 / 0 | 4,064 / 4,999 | `audit-step3-wireframe` pass → fail |
| 3, off | Slot off again | 5 / 0 | 4,025 / 4,999 | back to step 2 exactly (identical seeded answers) |
| 4 | k = 8 | 4 / 0 | 4,920 / 5,905 | `audit-onboarding-steps-order` pass → fail, 3 of 3 unseeded too |
| 5 | Two passages per raw session (k = 6, slot off) | **6 / 0** | 4,837 / 7,162 (scenario 5,521 / 7,378) | `scribe-sound-alike-names` fail → pass (unseeded 2 of 3 passing before and after); nothing lost |

k = 8 was reverted. At 8 the model wrote the onboarding steps as a
"- Step N — …" list with its one citation on the last item, which the
answer checks read as five uncited sentences. The answer itself was right,
but the regression rule stopped there. Step 5 was measured on its own, on
top of step 3-off, and kept (`passagesPerRaw: 2`) because it met the
rule set for it: at least one entry gained and none lost. Its one gold gain
is incidental. It shows the same records as before and adds each raw
session's second-best passage, which for the medication-flag session is
its Method, not the Key Findings holding "5 of 6". The entry passes because
the reworded answer cites that session's Objective for one sentence, while
the counts are still cited to the synthesis finding, and its unseeded runs
pass 2 of 3 both before and after. The real effect is evidence in view: for
four failing entries the second passage put the gold evidence in front of
the model (the burnout survey's quotes, the prior-auth v1 "inline source
citations" recommendation, the chart-review session's representative
quote, the onboarding session's sessions 4–6), and the model still doesn't
use it. It lengthens the prompt by
20–25% on average, most on survey-heavy questions where four of the six
records are raw sessions (up to +2,500 characters). Limiting the second
passage to sessions ranked in the top 3 would keep the one gain (that
session ranked 3rd) and, by estimate, cut about two thirds of the growth.
It wasn't built, since the growth stays well inside the context window.

**Answer-check fixes** (`backend/ask/checks.js`), found by reading every
uncited sentence the runs produced:
- A sentence with "not", "cannot" or "no" and the word "sources" anywhere
  is a decline. "The question cannot be answered from the provided sources."
  and "Steps 1, 2, 4, 5, and 6 are not explicitly labeled … in the provided
  sources." were counted as uncited claims. A decline's figures must still
  be in its sources or the question.
- Markers after a full stop that are followed by a lowercase word open the
  next sentence: in "…care coordinators. [1] mentions that three sessions…"
  the [1] is the subject of the second sentence, not a trailing citation
  of the first. Followed by a capital, as in "…sessions. [1] The next…" (374
  times in the stored runs, against 26 of the lowercase form), they stay
  with the sentence before.
- A list whose one citation sits on its last item is still read as
  uncited items. That's deliberate: the citation may cover only that item.

Every stored run, the baselines included, was re-judged with these rules.
No seeded verdict changed. The baseline and PR A runs' counts didn't change
at all. Steps 1–4 lost their uncited sentences except step 4's list items
(one per set, two in step 3's regression set), and one unseeded run of
`onboarding-required-steps` now passes in each of steps 1–3-off.

**Consequence:** cold embedding covers 431 passages instead of 548 (about
3–4 seconds instead of 6). The prompt is about 40% longer on average than
before RR-103 (3,419 → 4,837 regression, 3,730 → 5,521 scenario), for the
labels, roster lines and second raw passages. Cold latency rose from 3.1 to
4.1 seconds (regression mean). The remaining failures that don't cite
their raw session split three ways:
- The session isn't shown at all: the invite questions, and scribe v0.2 for
  the scribe-trust question.
- The evidence is in a third section of the session: the adoption window's
  "4 weeks" is in Method, and the prior-auth "show your work" is in the
  other Key Findings passage.
- The evidence was shown and the model didn't use it: the burnout survey's
  "52% of physicians", and the care coordinators' cross-referencing and
  distrust of AVS summaries.

See "Known gaps" in `docs/architecture.md`.
