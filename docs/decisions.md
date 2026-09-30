# Decision log

Short notes on why the project works the way it does. Newest decisions are
at the bottom. Status as of 2026-09-30.

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

**Update (2026-09-30):** `LLM_PROVIDER` now also takes `static`, the
public demo's pre-generated answers (decision 13), and a dev server can
switch between `static` and `ollama` at runtime (decision 14). There's
still no hosted-model provider.

## 2. Brute-force similarity search, no vector database

**Decision:** Compare the question against every passage with cosine
similarity.

**Why:** The corpus is about 500 passages; a vector database would add
infrastructure for no visible benefit. Revisit if the corpus grows by
orders of magnitude.

**Update (2026-09-30):** At agentic-repo commit 4ba145f (the corpus the
2026-09-29 evaluation runs record), the corpus splits into 548 passages,
431 of them retrievable; decision 15 keeps the other 117 out of retrieval.

## 3. Embeddings cached in memory, keyed by passage text

**Decision:** No work at startup. Embeddings are built on the first
question and reused, keyed by a hash of each passage's text.

**Why:** The server starts instantly and doesn't need Ollama running until
someone asks a question. Edited records re-embed only their changed
passages, with no cache-clearing code.

**Tradeoff:** The first question is slow (about 9 seconds cold), and the
cache is lost on restart.

**Update (2026-09-30):** Which measure "about 9 seconds" is wasn't recorded,
and no checked-in result supports it. The measures now in the docs: the
whole first question after a server start, including loading the models and
embedding the corpus, is 10 to 20 seconds (`backend/README.md`, not
measured by the evaluation harness); the evaluation's cold run, a question's
first seeded run with the corpus already embedded, averages 4.1 seconds on
the regression set (decision 15); its warm runs, the seeded median, are
faster.

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

**Status (2026-09-30):** "Save as deliverable" is a visual stub: the action
exists on an assistant reply (`AssistantMessage.jsx`, `ChatPanel.jsx`) but
stores nothing. Deliverable persistence isn't built. Saved Insights and
Pins live in the page's state only, and are gone when the user leaves the
page.

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


## 15. Retrieval changes for raw-session evidence

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
and their comparisons) were moved out of the repo and kept on the machine
that ran them. The table below summarizes each:

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
before these changes (3,419 → 4,837 regression, 3,730 → 5,521 scenario), for the
labels, roster lines and second raw passages. Cold latency rose from 3.1 to
4.1 seconds (regression mean; the evaluation's cold run, a question's first
seeded run, with the corpus already embedded). The remaining failures that don't cite
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

## 16. gemma2:9b stays the chat model after a local bake-off (v1.3.6.31)

**Decision:** Keep `gemma2:9b`. Two larger local models, `gemma3:27b` and
`qwen3:32b`, were run on both gold sets with exactly the retrieval and prompt
of decision 15's step 5, and each passed fewer entries: 3 of 10
regression against 6 of 10, and 0 of 7 scenario for all three. They took 4–6
times as long to answer and 2.5–3.5 times the memory. `gpt-oss:20b`, run
afterwards at thinking level low, passed 0 of 10 and 0 of 7. It answers as
fast as gemma2 but takes twice the memory.

**What was measured.** `scripts/eval-ask.js run --model` (backend/README.md,
"Other chat models"), seed 42, temperature 0.2, 3 seeded + 3 unseeded runs,
corpus 4ba145f, Ollama 0.34.3, all on one machine. Results are in
`backend/ask/eval/results/model-<tag>[-scenarios]`, compared in
`model-comparison.md` against `v1.3.6.7-step5` and `-scenarios`. Every model
was shown the same passages for every question (checked per question in the
comparison). `model-gemma2-9b` re-ran gemma2:9b through the changed code: all
17 seeded answers are byte-identical to step 5, and it supplies gemma2's
speed and memory, which step 5 didn't record. gpt-oss:20b was run later the
same way plus `--think low` (see "gpt-oss:20b" below), on Ollama 0.35.0.

| | gemma2:9b | gemma3:27b | qwen3:32b | gpt-oss:20b (think low) |
|---|---|---|---|---|
| Gold pass, regression / scenario | **6 / 0** | 3 / 0 | 3 / 0 | 0 / 0 |
| Raw session cited, regression / scenario | 4 / 3 | 7 / 6 | 5 / 6 | 3 / 4 |
| Uncited sentences, regression / scenario | 0 / 0 | 2 / 3 | 15 / 11 | 24 / 23 |
| Stacks of 3+, regression / scenario | 0 / 1 | 2 / 2 | 1 / 0 | 1 / 0 |
| Unsupported figures, regression / scenario | 0 / 0 | 11 / 7 | 8 / 0 | 33 / 15 |
| Unseeded runs passing, regression / scenario | 17 of 30 / 0 of 21 | 10 of 30 / 3 of 21 | 7 of 30 / 0 of 21 | 3 of 30 / 0 of 21 |
| Cold latency, mean / max (s), regression | 4.1 / 6.7 (control 3.8 / 6.1) | 22.2 / 27.6 | 16.7 / 25.6 | 3.9 / 9.5 |
| Cold latency, mean / max (s), scenario | 4.7 / 5.7 (control 4.4 / 5.5) | 29.6 / 38.5 | 24.1 / 28.8 | 5.8 / 11.3 |
| Tokens per second, cold run, mean / max | 40.9 / 43.5 (control) | 13.6 / 14.7 | 12.5 / 13.2 | 60.1 / 61.8 |
| Peak model memory (Ollama /api/ps, num_ctx 8192) | 6.1 GiB | 16.3 GiB | 20.6 GiB | 12.0 GiB |
| Wall time, both sets | 3.6 min | 24 min | 21 min | 5.6 min |
| Answer length, regression mean (words) | 25 | 93 | 71 | 69 |
| Ollama | 0.34.3 | 0.34.3 | 0.34.3 | 0.35.0 |

Per entry (seeded verdict, unseeded passes of 3), for every entry any model
fails. "Evidence" is whether the gold evidence was in the prompt, the same
for every model:

| Entry | gemma2:9b | gemma3:27b | qwen3:32b | gpt-oss:20b | Evidence in the prompt | Failure is |
|---|---|---|---|---|---|---|
| `onboarding-invite-worry` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | required raw not shown | retrieval |
| `onboarding-required-steps` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | raw shown | model |
| `prior-auth-citations` | PASS 3 | FAIL 0 | FAIL 0 | FAIL 0 | raw shown, 5 of 5 | model (the larger models) |
| `scribe-sound-alike-names` | PASS 2 | PASS 3 | PASS 0 | FAIL 0 | raw shown, 5 of 6 | model (gpt-oss's citation placement) |
| `audit-onboarding-steps-order` | PASS 3 | PASS 3 | FAIL 0 | FAIL 0 | 3 of 3 shown | model (qwen3's list format, gpt-oss's missing citations) |
| `audit-step3-wireframe` | PASS 3 | PASS 3 | PASS 3 | FAIL 3 | 4 of 6 shown | check wording (gpt-oss's bare decline) |
| `audit-session-timeout` | PASS 3 | FAIL 1 | PASS 3 | FAIL 0 | raw shown | check (gemma3 wrote the source's date) |
| `audit-adoption-window` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | raw shown, "4 weeks" is in a third section | retrieval (passage choice) |
| `audit-burnout-share` | FAIL 0 | FAIL 0 | FAIL 1 | FAIL 0 | raw shown, 52% in the prompt | model |
| `audit-ai-readiness` | PASS 3 | FAIL 0 | FAIL 0 | FAIL 0 | raw shown | check for gemma3 (a date), model for qwen3 (an uncited lead sentence) |
| `scenario-documentation-pain-points` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | raw shown, but re-entering fields isn't in the prompt (EHR is) | mostly retrieval |
| `scenario-scribe-trust` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | required raw (scribe v0.2) not shown | retrieval |
| `scenario-nurses-citations` | FAIL 0 | FAIL 3 | FAIL 0 | FAIL 0 | raw shown | check for gemma3 ("April 8th"), model for the others |
| `scenario-invite-expectation` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | required raw not shown | retrieval |
| `scenario-calendar-premise` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | raw shown | model |
| `scenario-care-coordinator-gaps` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | raw shown; float-pool and AVS open items in the prompt | model |
| `scenario-session-timeout-open` | FAIL 0 | FAIL 0 | FAIL 0 | FAIL 0 | required raw (IT Security interview) not shown; badge-tap and re-auth dispute not in the prompt | retrieval |

`scribe-sound-alike-names` and `audit-step3-wireframe` pass on the first
three models, and gpt-oss fails both. Four failures are retrieval's, and a fifth mostly is: the required raw
session, or the passage holding the answer, isn't in the prompt, so no chat
model can pass them. A larger model fixes none of them. "In the prompt" was
checked by matching the gold evidence against the text of the passages step 5
showed.

**What the larger models do differently.** Both cite raw sessions more
often and write three to five times longer answers with more figures, and
that is where they lose. gemma3:27b dates what it cites ("in April 2025",
"on February 17, 2026", "the April 8th usability test"). The date is in the
source's label in the prompt, but the answer checks look for figures only in
a source's title, section and excerpt. Counting the label date as evidence
(a scratch re-judge, not a change to the checks) gives gemma3 5 of 10 and
1 of 7 (`audit-session-timeout`, `audit-ai-readiness`,
`scenario-nurses-citations` flip), still below gemma2's 6 of 10. It changes
nothing for gemma2 or qwen3. qwen3:32b opens with an uncited lead sentence
and writes numbered lists whose one citation is in a sentence after the
list, which the checks read as uncited (decision 15). On
`onboarding-required-steps` it also states that steps 1, 5 and 6 are
required or optional without a source.

**gpt-oss:20b.** Run later with `--model gpt-oss:20b --think low`
(`model-gpt-oss-20b-low[-scenarios]`, digest 17052f91a42e), otherwise exactly
as above. It took thinking level low, the closest to thinking off. On
Ollama 0.35.0, `think: false` doesn't turn gpt-oss's thinking off: a
one-word probe still returned 136 characters of thinking and 46 tokens, about
as many as the default medium, against 13 characters and 16 tokens at low.
The harness now takes `--think LEVEL`, and it refuses to send `false` to a
model whose Ollama `think` values don't include it (backend/README.md).
- **Ollama version.** Ollama had moved to 0.35.0 by then. A gemma2:9b
  control on 0.35.0 gave all 10 regression seeded answers byte-identical to
  `model-gemma2-9b` on 0.34.3, so the upgrade alone doesn't change seeded
  output.
- **Seed 42 doesn't fully reproduce gpt-oss.** Within a run, 15 of 17
  questions gave three identical seeded answers. The two others,
  `scenario-documentation-pain-points` and `scenario-calendar-premise`,
  differ on the first (cold) run only. A second process gave 14 of 17 first
  seeded answers byte-identical, differing in wording on
  `onboarding-invite-worry`, `scenario-documentation-pain-points` and
  `scenario-scribe-trust`. Every one of those runs failed, so no verdict
  moved, but gpt-oss's seeded verdicts are stable in practice rather than
  guaranteed.
- **Where it loses.** It is mostly citation placement, not content:
  - Six of 17 answers put all their markers after the last sentence
    ("…study sessions. [1][2][3]"), so every sentence reads as uncited.
  - Six cite nothing, four of them in the regression set.
  - It writes a narrow no-break space in "34 %" (U+202F), which misses the
    `audit-ai-readiness` claim, and non-breaking hyphens (U+2011).
  - A scratch re-judge (not a check change) normalized U+202F and U+2011
    and attributed each paragraph-final marker group to that paragraph's
    uncited sentences. It gives gpt-oss 2 of 10 (`prior-auth-citations`,
    `audit-session-timeout`) and 1 of 7 (`scenario-nurses-citations`),
    still well below gemma2's 6 of 10, and changes nothing for the other
    three models.
  - Two more are close:
    - `audit-ai-readiness` then fails only on "December 2025", a label
      date, as with gemma3.
    - `audit-step3-wireframe`'s "The sources do not provide any
      information about a wireframe for step 3" misses the check's
      wording. Its three unseeded runs pass.
  - Even counting both, gpt-oss reaches 4 of 10.
- **Speed and memory.** It is the fastest model run (3.9 s cold on the
  regression set, 60 tokens per second) at 12.0 GiB. Thinking came back on
  all 102 runs, always in `message.thinking`, and no answer contains any of
  it.

**The five behaviors asked about.** None passes without a change, except the
useful decline:
- `scenario-calendar-premise`: no model makes the premise check. gemma2 and
  gemma3 report the skip attempts and the drop-off. gemma3 says "misinterpreted as
  optional". qwen3 presents them as the evidence for requiring the step,
  which the entry forbids, and so does gpt-oss ("Evidence that the calendar
  step must be required comes from multiple sources").
- `scenario-care-coordinator-gaps`: gemma2 declines ("The sources don't
  directly address…"). gemma3 and qwen3 both list open items with citations
  instead of declining, and gemma3 says what the data shows (ranking
  disagreements, cross-referencing 3–4 systems). They fail only on the two
  specific open items the raw notes list, float-pool coordinators and the
  unquantified AVS misses. This is the clearest gain from a larger model.
  gpt-oss also lists open items rather than declining, but uncited and
  none of the two the raw notes record.
- `scenario-session-timeout-open`: all fail. The IT Security interview that
  holds two of the three open items isn't in the prompt. All three name the
  missing "paused, draft preserved" state, but not as still unshipped.
  gpt-oss frames the open question as whether the 10-minute policy or the
  UI is at fault, which no record says is open.
- `audit-burnout-share`: no model both declines and says what the data shows.
  gemma2 only declines. gemma3 gives the 52% of physicians correctly but
  never says there is no overall burnout rate. qwen3 says there is none but
  leaves out the 52%. gpt-oss only declines, like gemma2, and cites
  nothing.
- `audit-step3-wireframe`: all pass. gemma3's is the most useful decline:
  it says step 3 is "Connect calendar" and a drop-off point, and that no
  source describes its layout. qwen3 cites all six sources on its decline
  sentence. gpt-oss fails it (above).

**Thinking text.** Ollama 0.34.3 returns a reasoning model's thinking in the
message's separate `thinking` field, not in `content`, and supports
`think: false` to turn it off (on qwen3:32b a one-word reply went from 94
generated tokens to 2). The harness asks Ollama for each model's
capabilities (`/api/show`) and sends `think: false` only to models listing
`thinking` (qwen3). gemma2 and gemma3 get the request they always did. The
client (`ask/ollama.js`) only ever returns `message.content`, now with any
leading `<think>…</think>` block removed (`finalAnswer()`, a no-op for every
reply that doesn't start with the tag), so the pipeline and harness parse
only the final answer. Every run records how much thinking text came back.
It was 0 on all 102 qwen3 runs. gpt-oss can't turn thinking off (above).
Its thinking came back in the separate field on every run, and its answers
were content only. The live route doesn't send `think`. With
`OLLAMA_CHAT_MODEL` set to a reasoning model its answers would still be
content only, but it would spend tokens thinking first.

**Consequence:** a larger local model isn't the next lever. What would move
the gold set is retrieval's passage choice (four failures are evidence that
never reaches the prompt) and prompt or check work on the behaviors above.
Re-run the bake-off after either changes: a larger model may do better on
the open-questions entries once the evidence is in view. gpt-oss:20b was
run at thinking level low only. Medium, its default, wasn't run. Its
remaining failures are mostly where it puts citations, which a prompt
change could reach. A re-run would also need to allow for its seeds not
fully reproducing.

## 17. Release versioning

**Date:** 2026-09-30. **Status:** Active.

**Decision:** A version such as v1.3 or v1.3.6.31 is a milestone label: it
orders planned work and names branches. For this repo, "shipped" means
released: a `vMAJOR.MINOR.PATCH` tag exists and that tag is deployed. Work
merged to `main` but not yet tagged is tracked as merged, not shipped.
agentic-repo isn't tagged; nothing pins to its tags, since the demo sync
and the evaluation harness pin commits instead. The tag rules are in the
README's
[Versioning and releases](../README.md#versioning-and-releases).

**Why (substance confirmed by the owner 2026-09-30; wording drafted):**
Releases need to be identifiable, and the deploy starts from a tag, so a
tag marks a release; merged work not yet tagged is tracked separately so
it isn't mistaken for released. agentic-repo isn't tagged because nothing
pins to tags: the demo sync and the evaluation harness pin commits.

## 18. Whole raw-session notes: measured, off by default (v1.3.6.37)

**Date:** 2026-09-30. **Status:** Measured. The option stays in the code,
off by default; whether to change the default is the owner's decision.

**What was tried:** `RETRIEVAL.wholeRawNotes` in `ask/pipeline.js`, off (0)
by default, and run with `scripts/eval-ask.js run --whole-raw-notes N`.
Set to N, it drops the raw sessions from the top 6 and shows the top N raw
sessions of the whole ranking instead. Each one gets its whole
`session-notes.md` under one label: every section in order under its own
heading, with the one-line roster header. The metadata sections and the
appended participants file are left out. Synthesis and doc records are
shown as before, and every record stays in ranking order. The idea came
from decision 15: for several failing entries, the evidence sat in a
section of a session that wasn't among its two best-scoring passages. It
was run at N = 2 (primary) and N = 4 (exploratory).

**Result:** Neither setting passes the stop rule. The rule stops a run
when a seeded pass turns into a fail and at least 2 of that entry's 3
unseeded runs also fail. An improvement counts only when at least 2 of 3
unseeded runs agree. Each setting gained two passing answers and lost
three. It was one round with no tuning, and the default is unchanged.

**What was measured:** gemma2:9b, seed 42, temperature 0.2, 3 seeded and
3 unseeded runs, corpus 4ba145f, both gold sets. Step 5 (decision 15) is
the baseline. Ollama is now 0.35.0 (step 5 ran on 0.34.3), so the current
defaults were run again first (`v1.3.6.37-control[-scenarios]`): all 51
seeded answers were byte-identical to step 5. Results are in
`backend/ask/eval/results/`: `v1.3.6.37-whole2[-scenarios]` and
`v1.3.6.37-whole4[-scenarios]`, with the before/after reports
`v1.3.6.7-step5[-scenarios]-vs-v1.3.6.37-whole2[-scenarios]` and the
same for `whole4`. Cells are regression / scenario. Step 5's token counts
come from the control run, which stored them: its prompts are identical
to step 5's.

| | Step 5 (default) | N = 2 | N = 4 |
|---|---|---|---|
| Gold pass | **6 / 0** | 4 / 0 | 5 / 1 |
| Unseeded runs passing | 17 of 30 / 0 of 21 | 15 of 30 / 3 of 21 | 15 of 30 / 0 of 21 |
| Raw session cited | 4 / 3 | 4 / 5 | 6 / 5 |
| Uncited sentences | 0 / 0 | 5 / 1 | 5 / 1 |
| Unsupported figures | 0 / 0 | 1 / 4 | 1 / 7 |
| Sentences with 3+ stacked citations | 0 / 1 | 1 / 0 | 1 / 0 |
| Prompt chars, mean / max | 4,837 / 7,162; 5,521 / 7,378 | 6,705 / 9,796; 7,498 / 8,411 | 9,596 / 14,308; 12,211 / 13,904 |
| Prompt tokens (Ollama), mean / max | 1,150 / 1,682; 1,294 / 1,730 | 1,554 / 2,191; 1,705 / 1,941 | 2,198 / 3,151; 2,754 / 3,068 |
| Largest prompt, share of `num_ctx` 8192 | 21% | 27% | 38% |
| Cold latency, mean / max (s) | 4.1 / 6.7; 4.7 / 5.7 | 4.8 / 9.0; 7.1 / 8.6 | 7.5 / 13.5; 11.5 / 14.7 |

Every prompt stayed under 85% of `num_ctx` (6,963 tokens). The largest
was 3,151 tokens.

Entries whose verdict changed. The numbers in brackets are unseeded runs
passing, out of 3:

| Entry | Step 5 | N = 2 | N = 4 | Under the stop rule |
|---|---|---|---|---|
| `onboarding-invite-worry` | FAIL (0) | PASS (3) | PASS (3) | gain at both |
| `audit-adoption-window` | FAIL (0) | PASS (3) | PASS (3) | gain at both |
| `scribe-sound-alike-names` | PASS (2) | FAIL (0) | PASS (2) | loss at N = 2 |
| `audit-onboarding-steps-order` | PASS (3) | FAIL (1) | FAIL (1) | loss at both |
| `audit-session-timeout` | PASS (3) | FAIL (0) | FAIL (0) | loss at both |
| `audit-step3-wireframe` | PASS (3) | FAIL (2) | FAIL (0) | seed noise at N = 2, loss at N = 4 |
| `scenario-nurses-citations` | FAIL (0) | FAIL (3) | PASS (0) | not counted: the seeded run and the unseeded runs disagree at both |

**What was learned:**
- **It works where the evidence was out of view.** For the two gains, the
  gold evidence wasn't in the prompt at step 5 and was with whole notes.
  On `onboarding-invite-worry`, the onboarding session ranked 14th of 21
  and wasn't shown; now the session 3 quote is shown and cited. On
  `audit-adoption-window`, the dashboard review was shown, but not its
  Method line ("the first 4 weeks of GA-candidate rollout"). The step 5
  answer already said "4 weeks" but cited the topline; now it cites the
  raw session.
- **A fixed N brings in sessions ranked far down, and they distract.** The
  top N raw sessions can rank well below the top 6. On
  `audit-step3-wireframe`, the onboarding session (12th of 97) came in,
  and the model read its session 1 ("paused at step 3 ('Connect
  calendar')… the 'required' indicator") as a description of the step 3
  wireframe, instead of saying there isn't one.
- **Bigger raw sources drew citations away from raw sessions.** On
  `audit-session-timeout`, the answer was word for word the same as step 5
  ("The current session timeout is 10 minutes."), but it cited the
  session-lock user flow instead of the raw session. On
  `scribe-sound-alike-names`, at N = 2, "5 of 6" was cited to the post-GA
  finding, not the concept test that holds it.
- **One loss is the answer's format.** On `audit-onboarding-steps-order`,
  the only change to the prompt was the onboarding session's whole notes.
  The answer listed the same six steps, but as "- " items instead of
  numbered lines, and the checks count those as five uncited sentences.
- **Evidence in view still isn't evidence used.** Where step 5 already
  showed the gold evidence (`audit-burnout-share`,
  `onboarding-required-steps`, `scenario-calendar-premise`,
  `scenario-documentation-pain-points`), whole notes didn't change the
  verdict. With whole notes, the chart-review session's Follow-ups reached
  the model, and `scenario-care-coordinator-gaps` now names both open
  items (the float-pool coordinators and the AVS tool) and cites the
  session. It fails only on its "what the data shows" claim. At N = 4,
  `scenario-scribe-trust` and `scenario-session-timeout-open` got their
  required sessions (3rd and 4th raw in the ranking) into view. The first
  now cites its session and fails only on the medication-errors claim.
  The second still doesn't cite its session.
- **Size isn't the constraint.** Even at N = 4, the largest prompt was 38%
  of `num_ctx`. The cost is latency: cold answers took about 0.7 s (regression) and 2.4 s
  (scenario) longer on average at N = 2, and roughly twice as long at N = 4.

**Not tried** (one round, no tuning): limiting whole notes to raw sessions
already in the top 6, so nothing comes in from far down the ranking;
N = 1; and whole notes for only the best-ranked raw session, with passages
for the rest.

**The prompt-size guard, added alongside.** Ollama doesn't refuse a
prompt longer than `num_ctx`. It keeps what fits and answers without
saying so. `ask()` now keeps Ollama's `prompt_eval_count` with the answer
as `promptTokens`. When the count is over 85% of `num_ctx`, it logs a
console warning, once per question. Ollama reports the full prompt even
when it reuses its cache, so the count holds on repeat questions. The
evaluation harness stores `promptTokens` with every run. With the guard
in place, the default configuration was run again
(`v1.3.6.37-guard[-scenarios]`): all 51 seeded answers were byte-identical
to step 5, and no prompt came near the limit (1,730 tokens at most).
