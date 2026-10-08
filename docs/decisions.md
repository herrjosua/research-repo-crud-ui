# Decision log

Short notes on why the project works the way it does. Newest decisions are
at the bottom. Status as of 2026-10-02.

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

**Known gap (closed):** Since agentic-repo RR-97 (merge `291ff63`), the
export scripts read correction files: each is appended to its session's html
under a `Correction (YYYY-MM-DD)` heading and listed in a `corrections` field.

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

## 19. Prompt behaviors: decline with evidence on, three left off (v1.3.6.38)

**Date:** 2026-10-01. **Status:** Active for decline with evidence; the
other three were tried and left off by default.

**What was tried:** four rules for the system prompt, each its own
switch in `PROMPT_BEHAVIORS` (`ask/answer.js`) and run with
`scripts/eval-ask.js run --behaviors`. With all four off, the prompt is
byte-identical to step 5's.
- **Premise check** (`premiseCheck`): when the question assumes
  something, check the assumption against the sources first, and say so in
  the first sentence if they don't support it. Target:
  `scenario-calendar-premise`.
- **Open items** (`openItems`): when the question asks what is unresolved
  or still open, list each open question, follow-up or unconfirmed item
  the sources state, one per item, each cited. Targets:
  `scenario-care-coordinator-gaps`, `scenario-session-timeout-open`.
- **Decline with evidence** (`declineWithEvidence`): replaces "say so
  plainly … and cite nothing". When the sources don't contain what was
  asked, say so in one sentence, then what they do show on the topic, with
  citations. Targets: `audit-step3-wireframe`, `audit-burnout-share`.
- **List format** (`listFormat`): each list item on its own line with its
  citation at its end, numbered when the items have an order. Target:
  `audit-onboarding-steps-order`.

Each was run alone against a control, then the ones that helped without a
net loss were run together. One extra run, not part of the decision, put
open items together with whole notes at N = 4 (decision 18). After the
round, one more run was added at the owner's request, beyond the ticket's
single combined run: decline with evidence and list format together. Its
rule was set in advance: list format becomes a default only if the pair
clears the uncited and unsupported counts without a counted regression. One
round, no tuning: no rule's wording was changed after it was measured.

**Result:** only decline with evidence meets the rule, and it is now on by
default. The combination is therefore decline with evidence alone, run
again at the new defaults (`behavior-combined`). Its seeded answers are
byte-identical to the decline-alone run on all 51 runs.
- Premise check: no gain, one regression. Off.
- Open items: no gain, two regressions. Off.
- Decline with evidence: one gain, no regression. On.
- List format: no verdict changed, and its target already passed. Off.
- Decline with evidence + list format (the added run): no counted
  regression, and it fixes the onboarding steps list. But it doesn't clear
  the counts (below), so list format stays off.

**What was measured:** gemma2:9b, seed 42, temperature 0.2, 3 seeded and
3 unseeded runs, corpus 4ba145f (checked before running: agentic-repo-dev
at that commit, not synced to agentic-repo main), Ollama 0.35.0, both gold
sets. The control is the current default configuration. Its 51 seeded
answers are byte-identical to `v1.3.6.37-guard`, so to step 5. The stop
rule is decision 15's:
- A seeded pass that turns into a fail counts as a regression only when at
  least 2 of the entry's 3 unseeded runs also fail.
- A gain counts only when at least 2 of 3 unseeded runs agree.

No gold entry or answer check was changed. Kept in
`backend/ask/eval/results/`:
- `behavior-control[-scenarios]` and `behavior-combined[-scenarios]`, with
  their before/after reports.
- `behavior-decline-list[-scenarios]`, the added run, with reports
  against the control and against `behavior-combined`.
- `behavior-extra-open-items-whole4[-scenarios]`, with reports against the
  control and against `v1.3.6.37-whole4`.

The four single-behavior runs (`behavior-premise`, `-open-items`,
`-decline`, `-list`) and their reports were moved out of the repo and kept
on the machine that ran them.

Cells are regression / scenario. Unseeded runs are out of 30 / 21. Prompt
sizes and cold latency are mean / max, regression then scenario.

| | Gold pass | Unseeded passing | Raw cited | Uncited sentences | Unsupported figures | Stacks of 3+ | Prompt chars | Cold latency (s) |
|---|---|---|---|---|---|---|---|---|
| Control (step 5) | 6 / 0 | 18 / 1 | 4 / 3 | 0 / 0 | 0 / 0 | 0 / 1 | 4,837 / 7,162; 5,521 / 7,378 | 3.9 / 6.3; 4.6 / 5.4 |
| Premise check | 5 / 0 | 7 / 0 | 3 / 3 | 0 / 2 | 0 / 1 | 0 / 1 | 5,127 / 7,452; 5,811 / 7,668 | 3.7 / 4.6; 5.2 / 7.2 |
| Open items | 4 / 0 | 11 / 0 | 3 / 3 | 5 / 2 | 9 / 1 | 0 / 1 | 5,129 / 7,454; 5,813 / 7,670 | 3.9 / 4.9; 4.8 / 6.5 |
| Decline with evidence | 5 / 0 | 17 / 0 | 5 / 4 | 5 / 2 | 5 / 1 | 1 / 1 | 4,878 / 7,203; 5,562 / 7,419 | 4.1 / 6.3; 5.0 / 6.7 |
| List format | 6 / 0 | 18 / 1 | 4 / 3 | 0 / 2 | 0 / 1 | 0 / 1 | 4,971 / 7,296; 5,655 / 7,512 | 3.7 / 5.7; 4.7 / 6.3 |
| **Combined = decline with evidence (new default)** | **5 / 0** | **20 / 0** | 5 / 4 | 5 / 2 | 5 / 1 | 1 / 1 | 4,878 / 7,203; 5,562 / 7,419 | 4.0 / 6.3; 4.9 / 6.4 |
| Decline with evidence + list format (added run) | 7 / 0 | 18 / 1 | 5 / 4 | 0 / 5 | 5 / 7 | 2 / 1 | 5,012 / 7,337; 5,696 / 7,553 | 4.2 / 7.2; 7.4 / 18.6 |
| Extra: open items + whole notes N = 4 | 4 / 2 | 16 / 3 | 6 / 6 | 6 / 9 | 5 / 11 | 0 / 0 | 9,888 / 14,600; 12,503 / 14,196 | 7.3 / 17.0; 12.3 / 20.9 |
| Whole notes N = 4 (decision 18, for the extra run) | 5 / 1 | 15 / 0 | 6 / 5 | 5 / 1 | 1 / 7 | 1 / 0 | 9,596 / 14,308; 12,211 / 13,904 | 7.5 / 13.5; 11.5 / 14.7 |

Entries whose verdict changed in any column, plus the three scenario
targets. Each cell is the seeded verdict, with unseeded runs passing out of
3 in brackets:

| Entry | Control | Premise | Open items | Decline | List | Combined | Decline + list | Extra | Whole N = 4 |
|---|---|---|---|---|---|---|---|---|---|
| `onboarding-invite-worry` | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | PASS (3) | PASS (3) |
| `prior-auth-citations` | PASS (3) | PASS (0) | PASS (1) | FAIL (3) | PASS (3) | FAIL (3) | PASS (1) | PASS (3) | PASS (3) |
| `scribe-sound-alike-names` | PASS (3) | FAIL (0) | FAIL (0) | PASS (0) | PASS (3) | PASS (2) | PASS (2) | FAIL (3) | PASS (2) |
| `audit-onboarding-steps-order` | PASS (3) | PASS (1) | FAIL (1) | FAIL (2) | PASS (3) | FAIL (3) | PASS (3) | FAIL (0) | FAIL (1) |
| `audit-step3-wireframe` | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | FAIL (0) | FAIL (0) |
| `audit-session-timeout` | PASS (3) | PASS (0) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | FAIL (1) | FAIL (0) |
| `audit-adoption-window` | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | PASS (3) | PASS (3) |
| `audit-burnout-share` | FAIL (0) | FAIL (0) | FAIL (0) | PASS (3) | FAIL (0) | PASS (3) | PASS (3) | FAIL (0) | FAIL (0) |
| `scenario-nurses-citations` | FAIL (1) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (1) | FAIL (0) | FAIL (1) | PASS (2) | PASS (0) |
| `scenario-calendar-premise` | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) |
| `scenario-care-coordinator-gaps` | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | PASS (1) | FAIL (0) |
| `scenario-session-timeout-open` | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) | FAIL (0) |

**The new default costs a seeded pass and isn't free on the checks.**
Decline with evidence passes 5 of 10 seeded against the control's 6: one
gain and two seeded losses. Neither loss counts under the rule, since both
entries still pass all 3 unseeded runs in the combined run, and the
unseeded total rises from 18 of 30 to 20.
- `prior-auth-citations`: the seeded answer cites the nurses' wish for
  "show your work" to the synthesis, not the v1 raw session.
- `audit-onboarding-steps-order`: the seeded answer is the "- Step N" list
  with one citation at the end, which the checks read as five uncited
  items with five unsupported figures. All 5 uncited sentences and all 5
  unsupported figures on the regression set are this one list.

The scenario set's 2 uncited and 1 unsupported come from one quote in
`scenario-documentation-pain-points` ("I love this job. I do not love
finishing my notes at 9pm…"): the citation follows the closing quote mark,
and the checks split the quote at its inner full stop. The same quote gives
the same counts under premise check and list format, so it's a check
artefact, not a behavior's.

**Decline with evidence.**
- `audit-burnout-share` passes, and its unseeded runs agree: "The sources
  do not contain information about the percentage of clinicians who report
  burnout. They do show that … 52% of physicians ranking it as the #1
  self-selected contributor to burnout [1]", cited to the raw survey. The
  52% was in the prompt at step 5 and went unused. The rule got the model
  to use it.
- `audit-step3-wireframe` still passes, now with a useful decline: step 3
  is "Connect calendar", it's required, and it's the largest drop-off
  point, each cited. The gold evidence that the only wireframe is step 4's
  wasn't in the prompt.
- It also moved `scenario-care-coordinator-gaps`. The answer now cites the
  chart-review session and says what the data shows: coordinators distrust
  the AVS summaries and want "what changed since…". It still fails, on its
  opening decline sentence and the two open items that weren't in the
  prompt.

**Premise check.** `scenario-calendar-premise` still fails, but the answer
now opens "The sources do not support making the calendar step required",
which meets the entry's second claim. It never says the step is already
required. The flow's "now clearly marked required" wasn't in the prompt.
The finding's "when it's actually required" was, and the model quoted it
without drawing the conclusion. The rule made the regression set less
stable: unseeded passes fell from 18 of 30 to 7.

**Open items.** Alone, it couldn't pass either target, because the open
items weren't in the prompt:
- `scenario-care-coordinator-gaps`: the chart-review session was shown
  only as its Key Findings and Representative Quotes, not its Follow-ups
  (float-pool coordinators, quantifying the AVS misses). The model still
  declined: "The sources don't say what hasn't been learned yet."
- `scenario-session-timeout-open`: the IT Security interview (11th of 97,
  the 4th raw session) wasn't shown, and the session-lock session's
  Follow-ups weren't either. The model listed two open items of its own,
  uncited.
- On `audit-onboarding-steps-order` the rule ("one per list item") turned
  the numbered steps into "- Step N" items with one citation at the end.
  That list is all 5 of its uncited sentences and 5 of its 9 unsupported
  figures. The other 4 are step numbers in `onboarding-required-steps`,
  which already failed.

**The extra run: open items with whole notes at N = 4.** It separates
"the rule doesn't work" from "the open items aren't in view". N = 4 is the
smallest setting that shows both targets' sessions whole (N = 2 leaves
the IT Security interview out). Against whole notes at N = 4 alone, open
items changes two seeded verdicts, and neither counts under the rule.
`scribe-sound-alike-names` fails seeded but passes all 3 unseeded runs.
- `scenario-care-coordinator-gaps` passes seeded. The answer lists the
  session's own follow-ups, each cited to the raw session: "quantify how
  often the AVS tool has missed medication changes", "revisit with
  float-pool coordinators specifically", and patient-history signals for
  the ranking. Only 1 of 3 unseeded runs pass, so it doesn't count as a
  gain. Two of the others leave out what the data shows, and one of them
  declines.
- `scenario-session-timeout-open` still fails, but now cites the IT
  Security interview and the session-lock Follow-ups ("re-test the
  abandon-and-redictate behavior once the explicit paused state ships"). It
  picks the wrong items from the interview: a quote about an AI recording
  session, not the 15-minute against 4-hour dispute or the badge-tap check.
- The cost is on the checks. `scenario-calendar-premise` became a list of
  uncited items (8 uncited, 11 unsupported), and the regression set
  carries whole notes' own losses (decision 18).

So the rule works when the open items are in view and can't work when
they aren't. A Follow-ups attachment, which isn't built, would test it
without whole notes' losses.

**`scribe-sound-alike-names` is fragile.** It flipped from pass to fail
under premise check and open items, and under whole notes at N = 2
(decision 18). Each time it was the same change: "5 of 6" was cited to the
post-GA finding, which repeats it, instead of the raw concept test that
holds it. The answer was otherwise right, and the entry fails only for not
citing the required raw session. Under decline with evidence its seeded run
passed but none of its unseeded runs did. Read its flips as one fragile
entry reacting to any change in the prompt, not as evidence against each
change on its own.

**List format.** No verdict changed. On its target the model wrote the
same numbered list as the control, with one group citation after it, and
not the per-item citations the rule asks for. It already passes that way.

**The added run: decline with evidence + list format.** Against the
control, no entry flips from pass to fail. `audit-burnout-share` still
gains (3 of 3 unseeded), and the seeded regression set passes 7 of 10,
against 6 for the control and 5 for decline alone. Against decline alone,
`audit-onboarding-steps-order` comes back. That gain counts, with 3 of 3
unseeded runs agreeing: the steps are a numbered list again, with a group
citation after it, instead of "- Step N" items. List format still stays
off, because the pair doesn't clear the counts. It moves them and adds new
ones:
- **Regression set:** uncited sentences go from 5 (decline alone) to 0,
  but unsupported figures stay at 5. They moved to
  `onboarding-required-steps`, which already failed: "Steps 1, 2, 4, 5,
  and 6 are not explicitly stated as required or optional in the provided
  sources." It's a decline that cites nothing, so the checks look for its
  figures in the question, which has none of them. Stacks of 3+ go from 1
  to 2.
- **Scenario set:** uncited sentences go from 2 to 5, and unsupported
  figures from 1 to 7. Most of it is `scenario-care-coordinator-gaps`. It
  now writes a long answer with three quotes, which the checks split at
  their inner full stops, plus figures like "6.5 min" and "4 of 5". That
  one answer is also the 18.6 s cold latency. It now names the float-pool
  coordinator, but still declines first and misses the AVS open item.
- **One unstable pass:** `prior-auth-citations` passes seeded, but only 1
  of its 3 unseeded runs passes, against 3 of 3 for the control.

**Consequence:** the system prompt has changed. The public demo's captured
answers (`ask/static/answers.json`) were made with the old decline rule
and should be recaptured before the next release that ships this
(backend/README.md, "Static mode"). That isn't done here.

**Not tried** (one round, no rewording):
- Premise check and open items with different wording.
- Open items with only the Follow-ups section attached.

## 20. Answer-check changes; list format stays off; gpt-oss:20b re-run (v1.3.6.39)

**Date:** 2026-10-01. **Status:** Active for the five checks changes. List
format was retested and stays off by default. Ticket RR-148. Follows
decisions 15 (RR-103) and 19 (RR-144).

**Decision:** `ask/checks.js` gets five changes, each with unit fixtures
(`tests/askChecks.test.js`):
1. **Label dates.** A source's date, as its label in the prompt shows it
   ("Apr 8, 2025"), is evidence for a figure. The answer may write it as
   2025-04-08, 04/08/2025, "April 8, 2025", "April 8th" or "April 2025". The
   mention is parsed and matched as a date, then taken out before figures are
   counted. A stray "04" or "08" is still a figure. Labels carry no time, so
   a time is always a figure. The label and prompt are unchanged.
2. **Decline window.** The "negation and the word *sources*" decline now
   needs the two within 80 characters of each other. `DECLINE_RE` ("the
   sources do not say…") is unchanged.
3. **Quotations.** A span in straight or curly double quotes is never split
   at its own full stops. A sentence can end at a closing quote mark when a
   capital or another quote follows, so a quote can also end mid-sentence
   ('"do I have to do this?" before proceeding').
4. **Uncited declines.** A decline that cites nothing may repeat figures
   from the question or from any source the prompt showed, not only the
   question. The live route passes its shown passages.
5. **Odd characters.** U+202F (narrow no-break space) is read as a space
   and U+2011 (non-breaking hyphen) as a hyphen before anything is judged,
   claim patterns included.

No gold entry was edited. No check other than these five was changed.

**How stored runs are re-judged.** A stored run keeps its cited excerpts,
but not their label dates, and of the shown passages only their ids. The
harness's new `prompt-sources` command rebuilds both, read-only, from the
corpus at the results' commit into
`ask/eval/prompt-sources/<commit>.json`. `report`, `compare` and `run` read
that file, and stored runs are never rewritten. At 4ba145f, every stored
cited excerpt matched the rebuild. So did every stored prompt size: 1,326 of
1,326 runs, rebuilt with each run's prompt behaviors. So the dates the
checks credit are the ones the model saw. `baseline` and `v1.3.6.7-checks`
predate passage ids, so change 4 gets only their shown records' labels.

**What the checks changes moved** (`checks-rejudge.md`). All 30 stored
result sets were re-judged: 1,530 runs, the baselines and the bake-off
included. The JSON files are unchanged and all 1,530 answers are
byte-identical. Each change was turned off on its own to attribute every
moved count. With all five off, the new code reproduces every old verdict
and count exactly.

| Result set | Gold pass | Unseeded passing | Uncited | Unsupported | By |
|---|---|---|---|---|---|
| `model-gemma3-27b` | 3 → **6** of 10 | 10 → 13 of 30 | 2 → 1 | 11 → 6 | 1 (one entry 1 and 3) |
| `model-gemma3-27b-scenarios` | 0 → **1** of 7 | 3 of 21 | 3 → 0 | 7 → 2 | 1, 3 |
| `model-qwen3-32b` | 3 | 7 | 15 → 14 | 8 → 7 | 3 (unseeded runs also 1, 4) |
| `model-qwen3-32b-scenarios` | 0 | 0 → 1 | 11 → 9 | 0 | 3 |
| `behavior-decline-list` | 7 | 18 | 0 | 5 → 0 | 4 |
| `behavior-decline-list-scenarios` | 0 | 1 | 5 → 1 | 7 → 5 | 3 |
| `behavior-combined-scenarios` | 0 | 0 | 2 → 0 | 1 → 0 | 3 |
| `v1.3.6.37-whole4-scenarios` | 1 | 0 → 1 | 1 | 7 | 1 |

Counts are the first seeded run's, as the reports give them. Per entry:

- **Change 1, label dates.** gemma3:27b's dates flip four seeded verdicts:
  `audit-session-timeout`, `audit-ai-readiness`,
  `scenario-nurses-citations` and, with change 3, `prior-auth-citations`.
  Two of those gains count under the stop rule:
  - `audit-ai-readiness`: 2 of 3 unseeded runs pass.
  - `scenario-nurses-citations`: 3 of 3.
  - `audit-session-timeout` (1 of 3) and `prior-auth-citations` (1 of 3)
    don't count.

  Decision 16's scratch re-judge predicted 5 of 10 and 1 of 7. The real
  change gives 6 of 10 because `prior-auth-citations` also needed the quote
  fix. Under these checks gemma3:27b's 6 of 10 on the regression set equals
  step 5's gemma2:9b, and is one ahead of today's default (5 of 10, below).
  It also leads on the scenario set (1 of 7 against 0). It's still 4–6
  times slower at 2.7 times the memory, and two of its four regression
  gains don't count. Decision 16 still stands.
- **Change 3, quotations.** It clears the RR-144 quote artefact: "I love
  this job. I do not love finishing my notes at 9pm…". That fragment was
  2 uncited and 1 unsupported in every gemma2 run that quoted it (step 5,
  v1.3.6.37, behavior control, combined, decline + list, in seeded and
  unseeded runs).
- **Change 4, uncited declines.** It clears `onboarding-required-steps` in
  `behavior-decline-list` (5 → 0 unsupported, every seeded run). "Steps 1,
  2, 4, 5, and 6" are all in the onboarding flow the prompt showed.
- **Changes 2 and 5** move no verdict and no count.
  - Change 2: every stored decline the negation rule counts has its
    negation within 60 characters of "sources". Of the two
    `onboarding-required-steps` sentences, the "…not explicitly labeled as
    required or optional in the provided sources" one (`behavior-combined`
    and `behavior-decline-list` unseeded) is 60 characters apart. The
    "…stated…" one (`behavior-decline-list` seeded) is 59. Both still
    count. The "far from its negation" fixture is made up: no stored
    answer has one.
  - Change 5 moves only failure reasons. gpt-oss:20b's "34 % of
    non‑clinical staff" (with U+2011) now meets `audit-ai-readiness`'s
    claim. "10 minutes" meets `audit-session-timeout`'s on one unseeded
    run. Those runs still fail on uncited sentences.

  Other odd characters in the stored answers: none. Every other non-ASCII
  character is an en or em dash or a curly quote.
- gemma2:9b's seeded verdicts don't move in any set.

**Retest: decline with evidence + list format.** Same rules as decision 19
(gemma2:9b, seed 42, temperature 0.2, 3 seeded + 3 unseeded runs, corpus
4ba145f, Ollama 0.35.0), both under the new checks. The control is the
current default (decline with evidence on, the rest off): `checks-control`
and `-scenarios`. The test adds list format (`--behaviors
decline-with-evidence,list-format`): `checks-decline-list` and
`-scenarios`. All 51 seeded answers in both are byte-identical to decision
19's `behavior-combined` and `behavior-decline-list`. Only the checks and
the unseeded draws differ. Cells are regression / scenario.

| | Control | Decline + list format |
|---|---|---|
| Gold pass | 5 / 0 | **7 / 0** |
| Unseeded passing (of 30 / 21) | 15 / 1 | 19 / 1 |
| Raw session cited | 5 / 4 | 5 / 4 |
| Uncited sentences | 5 / 0 | 0 / 1 |
| Unsupported figures | 5 / 0 | 0 / 5 |
| Stacks of 3+ | 1 / 1 | 2 / 1 |
| Prompt chars, mean / max | 4,878 / 7,203; 5,562 / 7,419 | 5,012 / 7,337; 5,696 / 7,553 |
| Cold latency (s), mean / max | 4.4 / 6.7; 5.9 / 7.3 | 4.5 / 8.5; 6.6 / 14.0 |

Per entry (seeded verdict, unseeded passing of 3), every entry that differs:

| Entry | Control | Decline + list | Stop rule |
|---|---|---|---|
| `prior-auth-citations` | FAIL (2) | PASS (3) | gain, counts |
| `audit-onboarding-steps-order` | FAIL (1) | PASS (3) | gain, counts |
| `scribe-sound-alike-names` | PASS (3) | PASS (2) | no flip |
| `audit-step3-wireframe` | PASS (2) | PASS (3) | no flip |
| `audit-burnout-share` | PASS (1) | PASS (2) | no flip |
| `scenario-care-coordinator-gaps` | FAIL (0), 0 uncited, 0 unsupported | FAIL (0), 1 uncited, 5 unsupported | no flip |

No regression on either set. Every other entry has the same verdict and
unseeded count in both.

**List format stays off.** The rule set in decision 19 still decides it:
list format becomes a default only if the pair clears the uncited and
unsupported counts without a counted regression. The regression set now
clears both (5 → 0 and 5 → 0), with two counted gains and no counted
regression. The scenario set doesn't clear them: uncited 0 → 1, unsupported
0 → 5. All six come from one answer, `scenario-care-coordinator-gaps`, and
from two check problems this decision records but doesn't fix (below):
- "(6.5 min vs. 9 min…)" splits at "vs.".
- The model puts each item's citation before it ("… P05 [3] The triage
  ranking…"), so every citation is credited to the item before.

That answer fails on its claims either way: it opens with a decline and
misses the AVS open item. If those two problems are fixed, `report` can
re-judge these runs with no re-run, and the rule may be met. List format
stays off under the rule as written: the checks were not changed to
unblock it. Fixing these two problems is the follow-up, RR-149 (checks
round 2), which re-judges the stored runs and re-decides list format. The
scenario cold-latency maximum is also that answer: 14.0 s against 7.3.

**Why the default reads 5 of 10 where step 5 read 6.** From the stored
runs only:
- The checks aren't the cause. Step 5 re-judged under the new checks reads
  6 of 10 with 17 unseeded passes, the same as under the old checks.
- The prompt is. All 10 of `checks-control`'s seeded regression answers are
  byte-identical to RR-144's decline-with-evidence runs (`behavior-decline`,
  moved out of the repo, see below, and `behavior-combined`). All 10 of
  `behavior-control`'s are byte-identical to step 5's, so the Ollama
  upgrade (0.34.3 to 0.35.0) changed none of them.

Three entries moved:
- `prior-auth-citations`, PASS → FAIL: it cites the synthesis finding and
  the v2 session (2025-11-04) instead of the v1 session.
- `audit-onboarding-steps-order`, PASS → FAIL: the steps are written as
  "- Step N" bullets with one citation at the end, 5 uncited sentences.
- `audit-burnout-share`, FAIL → PASS: it declines, then gives the cited 52%
  of physicians.

**A correction to decision 19's reasoning** (decision 19 is left as
written). Decision 19 held that neither seeded loss counts as a regression,
because both entries still passed 3 of 3 unseeded runs in the combined run.
In `checks-control`, `audit-onboarding-steps-order` passes 1 of 3 unseeded
runs. Across the three runs of the same setup it passes 2, 3 and 1
(`behavior-decline`, `behavior-combined`, `checks-control`).
(`behavior-decline` was moved out of the repo under decision 19's pruning
and was re-judged from a local copy. `behavior-combined`, which is in the
repo and is the same setup as decline alone, passes it 3 of 3 unseeded: the
other end of the range.) At 1 of 3 it
meets the stop rule's test for a counted regression against step 5.
Whether decline with evidence alone stays the default is left to the
re-decision in checks round 2 (RR-149). It isn't decided here.

**gpt-oss:20b re-run.** `--model gpt-oss:20b --think low` on the current
default configuration (`checks-gpt-oss-20b-low` and `-scenarios`): digest
17052f91a42e, Ollama 0.35.0. It ran next to the gemma2:9b control above,
same machine, same checks, compared in `checks-model-comparison.md`.
Decision 16's run (`model-gpt-oss-20b-low`) is re-judged under the new
checks for reference. Its prompt lacked decline with evidence, so it's
41 characters shorter per question, and none of its first seeded answers
match this run's.

| | gemma2:9b (control) | gpt-oss:20b, low | gpt-oss:20b, decision 16's run |
|---|---|---|---|
| Gold pass | **5 / 0** | 0 / 0 | 0 / 0 |
| Unseeded passing (of 30 / 21) | 15 / 1 | 2 / 0 | 3 / 0 |
| Raw session cited | 5 / 4 | 4 / 6 | 3 / 4 |
| Uncited sentences | 5 / 0 | 32 / 14 | 24 / 23 |
| Unsupported figures | 5 / 0 | 17 / 8 | 33 / 15 |
| Stacks of 3+ | 1 / 1 | 2 / 2 | 1 / 0 |
| Cold latency (s), mean / max | 4.4 / 6.7; 5.9 / 7.3 | 5.2 / 12.3; 5.5 / 7.3 | 3.9 / 9.5; 5.8 / 11.3 |
| Tokens per second, cold run, mean | 38.5; 32.4 | 47.4; 51.3 | 60.1 (regression) |
| Answer length, mean words | 38; 57 | 84; 152 | 69 (regression) |
| Peak model memory | 6.1 GiB | 12.0 GiB | 12.0 GiB |
| Wall time, both sets | 4.8 min | 7.1 min | 5.6 min |

Against the gemma2 control, per entry, judged on gpt-oss's unseeded runs as
its seeds don't fully reproduce:
- **Counted regressions (4):** `scribe-sound-alike-names`,
  `audit-session-timeout`, `audit-burnout-share` and `audit-ai-readiness`.
  Each passes seeded on gemma2 and fails seeded and 3 of 3 unseeded on
  gpt-oss.
- **Not counted:** `audit-step3-wireframe` fails seeded but passes 2 of 3
  unseeded.
- **Gains:** none. No scenario verdict changes.

What gpt-oss showed:
- **The checks changes don't rescue it.** It writes label dates and
  U+202F/U+2011 (now accepted), but it loses on citation placement, as in
  decision 16:
  - Three answers cite nothing: `onboarding-invite-worry`,
    `audit-onboarding-steps-order`, `audit-adoption-window`.
  - Six put every marker after a paragraph's last sentence, or on a line
    of their own.
  - `audit-ai-readiness` has the right figures, with "34 %" and "71 %"
    and the claims met. It fails on one uncited lead sentence.
- **Decline with evidence changed its declines.**
  - `audit-burnout-share` now says what the data shows (52% of physicians,
    cited). It fails on "The surveys do not report an overall burnout
    rate", which neither decline rule reads as a decline (below).
  - `audit-step3-wireframe` now declines and then explains. It fails on an
    uncited bridge sentence ("They do, however, describe step 3's role…")
    that repeats the question's "3".
- **Seeds reproduce less often.** Within a run, 13 of 17 questions gave
  three identical seeded answers, against 15 of 17 in decision 16. The
  four that didn't are `prior-auth-citations`,
  `scenario-scribe-trust`, `scenario-calendar-premise` and
  `scenario-care-coordinator-gaps`. Their seeded verdicts didn't depend on
  which answer was judged: all fail. gpt-oss returned thinking text on
  every run (102 of 102), none of it in an answer.
- **Speed.** It is slower than decision 16's run: 47 and 51 tokens per
  second against 60. Its regression cold mean is 5.2 s against 3.9, with
  longer answers (84 words against 69). The machine was a little slower
  too: the gemma2 control ran at 38.5 tokens per second against 40.9 in
  decision 16, and 4.4 s cold against 4.0 for the same configuration in
  decision 19. Against this gemma2 control, gpt-oss is now slower on the
  regression set (5.2 s cold against 4.4) and slightly faster on the
  scenario set (5.5 against 5.9).

gemma2:9b stays the chat model (decision 16 stands).

**The control's unseeded runs vary.** Its seeded answers are byte-identical
to decision 19's `behavior-combined`, yet 15 of 30 unseeded regression runs
pass, against 20 there. `audit-burnout-share`'s gain under decline with
evidence was counted in decision 19 on 3 of 3 unseeded runs. Here it passes
1 of 3 under the control and 2 of 3 under decline + list.
`audit-onboarding-steps-order` passed 3 of 3 unseeded in
`behavior-combined` and passes 1 of 3 here (above). With 3 unseeded
runs, one entry's count moves by 1–2 between identical configurations, so
the stop rule's 2-of-3 threshold sits inside that noise.

**Check problems found and not fixed** (no check other than the five was
changed):
- **Abbreviations end sentences.** "vs." and "avg." split a sentence
  ("It was faster (6.5 min vs." becomes an uncited sentence with an
  unsupported "6.5"). Seen in `scenario-care-coordinator-gaps` and
  `scenario-documentation-pain-points`.
- **Leading markers before a capital** are credited to the sentence
  before ("…P05 [3] The triage ranking…"). When a model cites at the start
  of each item, every citation moves back one sentence, and "P05" is
  flagged as "05".
- **Declines without the word "sources."** "The surveys do not report an
  overall burnout rate" (gpt-oss, `audit-burnout-share`) is read as an
  uncited claim. `DECLINE_RE`'s nouns don't include "surveys", and the
  negation rule needs "sources".
- **A marker line after a paragraph** ("[1][2][3]" on its own line) joins
  only the paragraph's last sentence (gpt-oss, `audit-session-timeout`).
- **Month-and-year dates match loosely.** A month-and-year mention matches
  any cited source dated that month: gemma3's "the November 2025 testing",
  cited to a deliverable dated Nov 20, 2025, while the test was Nov 4.
  That's the "April 2025" form as asked.
- **Single curly quotes** (‘…’) aren't treated as quotation marks, since
  ’ is also an apostrophe. gemma3 writes ‘ 6 times in the stored runs.
- **The capture script's figure flag**
  (`scripts/capture-static-answers.js`) uses the figure rule without label
  dates or shown sources, so its review can flag a date the harness now
  accepts.

**Still not done:** recapturing the public demo's saved answers
(`ask/static/answers.json`), as in decision 19.

**Kept in `backend/ask/eval/results/`:**
- `checks-rejudge.md`.
- `checks-control[-scenarios]` and `checks-decline-list[-scenarios]`,
  with `checks-control-vs-checks-decline-list` and
  `checks-control-scenarios-vs-checks-decline-list-scenarios`.
- `checks-gpt-oss-20b-low[-scenarios]` and `checks-model-comparison.md`.

All of these are final runs. No intermediate runs were made, so nothing was
moved out. The reports stored before this decision are left as written,
under the checks of their time. `report` re-judges any of them under these.

## 21. Answer-check changes, round 2 (v1.3.6.40)

**Date:** 2026-10-02. **Status:** Active. List format stays off by
default. Ticket RR-149. Follows decisions 15 (RR-103), 19 (RR-144) and 20
(RR-148).

**Decision:** `ask/checks.js` gets two changes, each with unit fixtures
built from stored answers (`tests/askChecks.test.js`), numbered as in
RR-149's investigation:
- **Change 1: "vs." and "avg." don't end a sentence.** Within a line, the
  whitespace after a whole word "vs." or "avg." (any case) is never a
  sentence break: "It was faster (6.5 min vs. 9 min to clear a 20-item
  queue), but 4 of 5 participants disagreed…" and "…charting (avg. 1.2
  hrs/day) [1][2]." are one sentence each. A line ending in "vs." or
  "avg." still ends its sentence, because lines are split first. Only
  these two. The other abbreviations ("e.g.", "i.e.", "approx.", "cf.",
  "etc.", "No.") are never followed by a space in the stored answers: the
  four "e.g." uses in the 44 sets (three in the repo's sets, one in
  `~/rr144-results`) are all "e.g.,", which never split. A bare "e.g.
  step 3" still splits, a recorded limitation. A sentence that really ends
  in "vs." or "avg." before a new sentence no longer splits there either;
  none occurs in the stored answers.
- **Change 3(a): "surveys" is a decline noun.** `DECLINE_RE` takes
  "survey(s)" beside "sources", "records", "notes" and the rest, so "The
  surveys do not report an overall burnout rate for clinicians." is a
  decline. The 80-character window for the negation-and-"sources" rule is
  unchanged.

The principle: the checks may correct how sentences are split and recognise
honest declines from wording the models actually wrote. They don't change
where a citation is expected, which is after the sentence it supports, and
they add no new group-citation forms. Anything else found is recorded, not
applied. No gold entry, prompt or retrieval setting was changed, and no
check other than these two.

**What was left, and why** (numbered as in RR-149's investigation):
- **Item 2, markers before a capital** ("…P05 [3] The triage ranking…").
  The checks apply the documented rule: markers after a full stop and
  before a capital belong to the sentence before. Answers that put the
  marker first on each item occur only in non-default gemma2
  configurations (list format, open items, premise check, whole notes).
  Crediting them forward would change where a citation is expected.
- **Item 4, a marker-only line after a paragraph** ("[1][2][3]" on its own
  line) still joins only the paragraph's last sentence. Crediting it to the
  whole paragraph would be a new group-citation form.
- **Item 5, month and year.** "April 2025" still matches any cited source
  dated that month, the form decision 20 accepted.
- **Item 6, single curly quotes** (‘…’) still aren't quotation marks, since
  ’ is also an apostrophe.
- **Item 7, the capture script** (`scripts/capture-static-answers.js`): its
  figure flag and its own sentence splitter move to the demo recapture
  ticket.

**Other problems recorded, not fixed:**
- The verb "note" is read as `DECLINE_RE`'s noun. The stored case is
  `checks-gpt-oss-20b-low`, `audit-step3-wireframe`, unseeded 2: "They
  describe step 3 as “Connect calendar” and note that it is required, but
  no visual or layout details are provided." It counts as a decline and
  needs no citation. "The readout notes that coordinators did not report
  the override reasons." is a constructed example of the same pattern.
- A participant ID such as "P05" would be read as a figure. This is latent:
  the checks have no participant-ID rule, and RR-148's quote handling merges
  the P05 text into a sentence citing [2, 3], where [2] contains "P05".
- An ISO date in an answer that isn't one of its cited sources' label dates
  is flagged digit by digit.
- A marker before a sentence that opens with a digit is credited to the
  sentence before.
- Declines worded "No source provides…" or "The documentation does not
  specify…" are still read as uncited claims: seven distinct sentences, 11
  records in 10 runs (gpt-oss 8, gemma3 3), none in the
  default-configuration sets. A variant that adds them was sized in the
  RR-149 investigation (notes in Notion, not in this repo) and not
  applied, because it was written after seeing those sentences.

**The re-judge** (`ask/eval/results/checks-rejudge-rr149.md`). All 36
stored sets in the repo (1,836 runs) and the 8 RR-144 sets in
`~/rr144-results/` (408 runs, outside the repo) were re-judged with the
checks at ff5ce49 and with both changes. `~/rr103-results/` is excluded. No
model was called. Every stored JSON file kept its SHA-1 and every answer is
byte-identical. Each change was turned off on its own to attribute every
moved count. With both off, the new code reproduces every old sentence,
verdict and count on all 2,244 runs.

Change 1 moved ten runs:

| Result set | Entry | Run | Abbreviation | Uncited | Unsupported |
|---|---|---|---|---|---|
| `behavior-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 0, 1, 2 | vs. | 1 → 0 each | 5 each |
| `checks-decline-list-scenarios` | `scenario-care-coordinator-gaps` | seeded 0, 1, 2 | vs. | 1 → 0 each | 5 each |
| `behavior-decline-list-scenarios` | `scenario-documentation-pain-points` | unseeded 0 | avg. | 2 → 1 | 4 → 0 |
| `checks-decline-list-scenarios` | `scenario-documentation-pain-points` | unseeded 0 | avg. | 3 → 2 | 4 → 0 |
| `model-gpt-oss-20b-low-scenarios` | `scenario-care-coordinator-gaps` | unseeded 2 | vs. | 7 → 6 | 2 → 1 |
| `behavior-list-scenarios` (`~/rr144-results`) | `scenario-documentation-pain-points` | unseeded 2 | avg. | 1 → 0 | 4 → 0 |

Change 3(a) moved three: `checks-gpt-oss-20b-low`, `audit-burnout-share`,
seeded 0, 1 and 2, uncited 2 → 1 each. No other sentence in the 44 sets
changed, and no verdict moved, seeded or unseeded. None of the
default-configuration sets moved (612 runs).

| Result set | Gold pass | Unseeded passing | Uncited | Unsupported | By |
|---|---|---|---|---|---|
| `behavior-decline-list-scenarios` | 0 of 7 | 1 of 21 | 1 → 0 | 5 | 1 |
| `checks-decline-list-scenarios` | 0 of 7 | 1 of 21 | 1 → 0 | 5 | 1 |
| `checks-gpt-oss-20b-low` | 0 of 10 | 2 of 30 | 32 → 31 | 17 | 3(a) |

Counts are the first seeded run's, as the reports give them.

- **Care coordinator.** The "…(6.5 min vs." fragment is gone, but the
  merged sentence is still credited to [4] (item 2, left above), so its
  five figures (6.5, 9, 20, 4, "4 of 5") stay unsupported.
- **"avg."** The uncited "…charting (avg." fragment and its four figures
  (the 1 of "#1", 52, 31, 64) are gone.
- **gpt-oss `audit-burnout-share`** stays FAIL in all three seeded runs.
  "No source provides a direct percentage of clinicians experiencing
  burnout." is still uncited: it has singular "source" with the negation
  first, so neither decline rule matches it. Decision 20's gpt-oss
  comparison stands, and so does decision 16.

**Predictions, written before the re-judge.** Predictions 2, 3 and 4
matched. Predictions 1 ("change 1 moves exactly 9 records") and 6 ("no
other sentence changes") missed on one record:
`behavior-list-scenarios`, `scenario-documentation-pain-points`, unseeded 2.
It's the same "avg." sentence as the two in-repo "avg." rows. The miss is
one of scope: the predictions came from investigating the 36 in-repo sets,
and the re-judge also covered `~/rr144-results`. No check was changed for
it. Prediction 5 (gpt-oss `audit-burnout-share` may pass) didn't happen,
for the reason above.

**List format stays off.** Decision 19's rule, under the new checks:
a set clears only if its first seeded uncited and unsupported counts are
both 0, and both sets must clear with no counted regression. Decline with
evidence plus list format (`checks-decline-list[-scenarios]`) against
decline with evidence alone (`checks-control[-scenarios]`):

| | Control | Decline + list format |
|---|---|---|
| Gold pass, regression / scenario | 5 of 10 / 0 of 7 | 7 of 10 / 0 of 7 |
| Unseeded passing (of 30 / 21) | 15 / 1 | 19 / 1 |
| Uncited, regression / scenario | 5 / 0 | 0 / 0 |
| Unsupported, regression / scenario | 5 / 0 | 0 / 5 |

The regression set clears, with two counted gains (`prior-auth-citations`
and `audit-onboarding-steps-order`) and no counted regression. The scenario
set doesn't: its 5 unsupported figures are the care-coordinator answer's
misplaced citations (item 2, left). So decline with evidence alone stays
the default. Its counted regression against step 5 is recorded:
`audit-onboarding-steps-order` passes 1 of 3 unseeded runs in
`checks-control` (decision 20's correction to decision 19).

**Corrections to decisions 16, 19 and 20** (left as written):
- Decision 20 said "P05" is flagged as "05". Only `ask/checks.js` before
  RR-148 (`1c7d86a^`) flagged it: in six care-coordinator runs (seeded 0–2
  in `behavior-decline-list-scenarios` and `checks-decline-list-scenarios`)
  the quote split left its end and the P05 attribution in a sentence of
  their own ("I don't need it to think for me." — Care Coordinator (float
  pool), P05 The triage ranking works…"), citing only [3]. At ff5ce49
  (decision 20's checks) and under the new checks, no sentence in the 44
  sets has "05" unsupported: RR-148's quote handling puts the P05 text in a
  sentence citing [2, 3], and [2] contains "P05".
- Decision 20's re-judge ("30 sets, 1,530 runs") was right when it ran.
  The repo now holds 36 sets and 1,836 runs because decision 20 added six.
- Decision 16's gpt-oss 2 of 10 and 1 of 7 (from 0 and 0) came from a
  scratch re-score that both normalized U+202F/U+2011 and credited
  paragraph-final marker groups. Decision 20 reports that its change 5
  (normalization alone) moved no gpt-oss verdict, and under the current
  checks gpt-oss's decision 16 run still passes 0 of 10 and 0 of 7.
- The "vs." split, which decision 20 and the old test comment called not
  fixed, is fixed here.

**Reproducibility.** 18 of the 36 stored sets in the repo record a
`-dirty` appCommit (the gemma2, gemma3, qwen3 and gpt-oss bake-off sets,
and the `v1.3.6.7-*` and `v1.3.6.37-*` sets except `v1.3.6.37-control`).
Their pipeline code can't be recovered exactly from git. Their stored
answers and sources are what's re-judged, so this doesn't affect the
checks results.

**Still not done:** recapturing the public demo's saved answers
(`ask/static/answers.json`), as in decisions 19 and 20.

**Kept in `backend/ask/eval/results/`:** `checks-rejudge-rr149.md`. No runs
were made. The reports stored before this decision are left as written,
under the checks of their time. `report` re-judges any of them under these.

## 22. Follow-ups attachment for 'what's unresolved' questions: measured, off by default (v1.3.6.44)

**Date:** 2026-10-03. **Status:** Measured. The option stays in the code,
off by default, and no default changes. Ticket RR-145. Follows decisions
18 (whole raw notes), 19 (prompt behaviors) and 21 (the checks it is
judged by).

**What was built:** `RETRIEVAL.followUps` in `ask/pipeline.js`: `false`
(the default), `'shown'` or `'linked'`.
- `'shown'` adds the `Follow-ups / Open Questions` chunk
  (`FOLLOW_UPS_HEADING` in `ask/corpus.js`) of each raw session already
  selected, next to that session's own passages.
- `'linked'` does the same, and also adds the Follow-ups of each raw
  session linked, through `provenanceLinks`, to the first two synthesis
  records in the ranking (findings and analytics, as `sourceClass`
  defines it). A linked session that isn't otherwise shown goes after the
  selected records.
- A chunk already selected is skipped, a session shown whole
  (`wholeRawNotes`) is skipped, and the question's project filter is
  honored. The onboarding sessions record has no Follow-ups section and
  gets no attachment.
- It applies only when the question matches the trigger,
  `asksWhatIsUnresolved()`. The pattern is P1 from the RR-145
  investigation, frozen for the ticket and copied verbatim into the code.
  It matches case-insensitively, after curly apostrophes (U+2018, U+2019)
  are read as straight ones. It fires on "unresolved", "undecided",
  "unanswered", "outstanding", "still open", "open questions / items /
  issues", "haven't / hasn't … learned / decided / confirmed…", "not (yet)
  known / resolved…" and "still unknown / unclear / don't know".
- `scripts/eval-ask.js run --follow-ups shown|linked` sets it, and
  `metadata.retrieval` records it. When the option is on, each run stores
  an optional `followUps: { fired, attached }` field (`attached` is the
  list of chunk ids). `EVAL_HARNESS_VERSION` stays 1, and stored runs and
  reports are unchanged.
- **Side effect:** `RETRIEVAL` now has the key, so new runs record
  `followUps: false` in `metadata.retrieval` even with the option off.
  The compare command warns about different retrieval when a new run set
  is compared with an older one, as it did when `wholeRawNotes` was added.

**What was measured:** gemma2:9b (digest `ff02c3702f32…`) and
nomic-embed-text (`0a109f422b47…`) on Ollama 0.35.0, corpus 4ba145f, seed
42, temperature 0.2, 3 seeded and 3 unseeded runs, app commit 30116eb.
Two target entries only: `scenario-care-coordinator-gaps` and
`scenario-session-timeout-open`. Five configurations, each with decline
with evidence on (the default):
- the control (option off);
- `shown`;
- `linked`;
- `shown` with the open-items behavior also on;
- `linked` with the open-items behavior also on.

Open items here is decision 19's rule. But decision 19's open-items run had
decline with evidence off, so it isn't a like-for-like comparison.

**The control check.** The control reproduced the stored
`checks-control-scenarios` byte for byte. For both targets, all three
seeded runs match on answer text, cited sources, shown passages and prompt
size. The corpus commit, both model digests, the Ollama version, the seed
and the temperature also match.

**Result.** Each cell is the first seeded run, as the reports judge it.
All seeded runs were identical in every configuration. Prompt sizes are in
characters, care / timeout. Cold latency is mean / max over the two
targets.

| Configuration | Care coordinator | Session timeout | Prompt chars | Cold latency (s) | Cold tokens/s, mean / max |
|---|---|---|---|---|---|
| Control | FAIL: missing float-pool and AVS-frequency items; forbidden decline | FAIL: doesn't cite 05-20; missing the dispute and badge-tap | 6,399 / 4,361 | 5.6 / 5.7 | 38.3 / 38.7 |
| `shown` | FAIL: cites no supporting record and not 01-29; missing float-pool, AVS frequency and what the data shows; forbidden decline | FAIL: same three reasons as the control | 7,734 / 4,912 | 6.7 / 7.3 | 38.2 / 39.5 |
| `linked` | FAIL: missing float-pool and AVS-frequency items; forbidden decline | FAIL: doesn't cite 05-20; missing the dispute, badge-tap and the paused-state / re-test item | 8,812 / 6,982 | 7.1 / 7.2 | 37.4 / 38.1 |
| `shown` + open items | FAIL: missing what the data shows | FAIL: doesn't cite 05-20; missing the dispute, badge-tap and fixed policy / draft survives | 8,026 / 5,204 | 5.8 / 6.0 | 36.5 / 37.2 |
| `linked` + open items | FAIL: missing what the data shows | FAIL: doesn't cite 05-20; missing the dispute and badge-tap | 9,104 / 7,274 | 7.5 / 8.1 | 26.3 / 27.3 |

- **Checks:** in every configuration, the first seeded run of each target
  has 0 uncited sentences, 0 unsupported figures and 0 stacks of 3+. The
  reports judge only that run, so these counts don't cover the other
  runs. No run of the 60 returned thinking text.
- **Prompt size:** the open-items rule adds 292 characters to each
  prompt. Token counts are Ollama's `promptTokens` for the first seeded
  run. Ollama can report fewer tokens when a prompt is cached from the run
  before, but here all six runs of each target agree in every
  configuration. The largest prompt is 2,164 tokens (`linked` + open
  items, care), 26% of `num_ctx` 8192. Every prompt stays far below the
  85% guard (6,963 tokens).
- **Trigger:** the trigger fired, and its attachments were the same, in
  all six runs of each target in every treatment configuration.
  - Care, `shown`: the 01-29, 08-26 and 12-16 Follow-ups.
  - Care, `linked`: the same three, then 04-22, 05-20 and 10-07.
  - Timeout, `shown`: 02-17.
  - Timeout, `linked`: 02-17, then 02-10, 04-22, 05-20, 10-07 and 12-16.
- **Unrelated records under `linked`:** `linked` added the Follow-ups of
  two records unrelated to either question,
  `raw:2025-04-22-contextual-inquiry-ed-intake-shadowing` and
  `raw:2025-10-07-contextual-inquiry-behavioral-health-sensitive-notes`.
  They came in because `finding:scope-boundaries-and-workflow-fit` is one
  of the first two synthesis records for both questions, and it links to
  them, as the investigation predicted.

**Predictions, written before the build and before any run:**
1. The trigger fires on exactly the two targets among the 17 gold
   questions, and the other 15 prompts are byte-identical to the
   control's. **Matched.** Run again against `gold.json` for this
   decision, it fires on exactly the two. The byte-identical prompts come
   from the build's no-model check, with stored rankings and a stub
   embedder, and weren't run again here.
2. The control reproduces the stored seeded answers. **Matched** (above).
3. Prompt sizes match the investigation, all under 25% of the window.
   **Sizes matched exactly:** care +1,335 (`shown`) and +2,413 (`linked`);
   timeout +551 and +2,621. **The 25% part didn't match.** By Ollama's
   counts (first seeded run), `linked` care is 2,098 tokens (25.6%). The
   largest prompt, 2,164 tokens (26.4%), is from `linked` + open items,
   which the prediction didn't cover. Every prompt stays far below the
   85% guard (6,963 tokens).
4. In every treatment, the care prompt holds the 01-29 Follow-ups chunk.
   **Matched.** `#6` is shown in all four, beside `#2` and `#4`.
5. Care passes seeded in at least one of the four treatments. **Not
   matched.** It fails in all four. The open-items runs narrow it to one
   failure reason.
6. Timeout stays FAIL in all five. **Matched.** Under `linked`, the
   answers were expected to include badge-tap and the re-test item and to
   cite 05-20 in at least one seeded run. **Not matched.** The 05-20
   Follow-ups chunk was in the prompt (source 11 for timeout, 14 for care),
   but none of the 60 runs cites 05-20, and no answer names badge-tap.
7. With open items on, answers may be list-shaped and may open lines with
   a marker. They were lists. No line in any run opens with a marker, so
   the checks had nothing to misread.
8. Prompt size and latency are reported, and none comes near the guard.
   **Matched.**

**Decision rule (set in advance):** a gain is the care entry passing its
seeded run and at least 2 of its 3 unseeded runs under a treatment. The
timeout entry can't flip by design (its claim 0, the 15-minute against
4-hour dispute, isn't in any Follow-ups section). No configuration passed
the care entry's seeded run, so there is no gain. The attachment stays
off, no default changes, and no gold entry or check was changed.

**What the result says:**
- **The open items reach the prompt.** In all four treatments, the care
  prompt holds the 01-29 Follow-ups with the float-pool and AVS-frequency
  items.
- **With decline with evidence alone, the model doesn't use them.**
  - Under `shown`, the care answer still opens with a decline. It cites
    `finding:scope-boundaries-and-workflow-fit` and the December executive
    retro ("don't build this yet…") instead of 01-29, and it loses the
    data claim the control made. The capture script flags its citations
    as possibly unrelated.
  - Under `linked`, the answer is again a decline plus what the data
    shows, citing 01-29 and 08-26, and it still misses both open items.
- **With open items on, the model uses them, then drops "what the data
  shows".** In every seeded run of both open-items configurations, and in
  11 of their 12 runs, the care answer is exactly the two 01-29 Follow-ups
  bullets ("Quantify how often the AVS tool has missed medication
  changes…", "Revisit with float-pool coordinators specifically…"), cited
  to that Follow-ups passage, with no decline. The exception is one
  unseeded run of `shown` + open items, which adds a third bullet from the
  08-26 Follow-ups (sharing the override-capture idea with the Data
  Science team), cited to that passage. That meets both open-item claims
  and removes the forbidden decline. The judged answer (the first seeded
  run) has nothing else, so it fails on the gold entry's other half, what
  the data does show.
- **On timeout, the open-items answers list the 02-17 Follow-ups items**
  (re-test the abandon-and-redictate behavior; extend the "paused,
  preserved" pattern) and cite that record. No run uses or cites the 05-20
  interview.

**The held-out check.** The owner wrote eight questions in their own
wording, before seeing the pattern, and they were checked against
`asksWhatIsUnresolved` with no model:
- **Five N questions** (ordinary questions about decisions, pain points,
  success rates, files and personas): none fires.
- **Three Y questions** ("What information is missing about the pain
  points…", "What is the biggest area of research that we are missing
  about this flow?…", "Do we have enough information about the
  burnout?"): none fires either. Recall is 0 of 3.

The pattern has no "missing", "enough information" or "gap" wording. It
isn't changed here: a widened pattern would be a new one, with new
held-out questions and a new measurement.

**Not checked:**
- The unseeded runs' verdicts, and the stop rule's unseeded counts. They
  weren't needed, since no seeded run passed, and weren't computed. The
  reports count only distinct unseeded answers.
- Why `linked` + open items generated at about 26 tokens per second cold
  (mean), against means of 36.5 to 38.3 for the other four.
- The checks' counts (uncited sentences, unsupported figures, stacks) for
  any run other than the first seeded run of each configuration.
- The full sets, for any configuration (none gained). So the full-set
  before/after table and the stop rule's unseeded counts in RR-145's
  acceptance criteria are met only in part, by design.
- Other models.

**Follow-ups, named, not filed:**
- An open-items prompt that asks for both the open items and what the
  data shows. That needs its own measured round on prompt wording.
- Coverage questions ("what is missing", "do we have enough") are a
  different kind of question from the open items a session lists, and go
  to RR-153.

**Kept in `backend/ask/eval/results/`:**
- `rr145-control`, `rr145-shown`, `rr145-linked`,
  `rr145-shown-open-items` and `rr145-linked-open-items` (`.json` and
  `.md`).
- Six reports: control against each of the four, and `shown` and
  `linked` each against its open-items pair.

The 4ba145f prompt-sources file gains the attached passages: 2 records and
8 passages, with no entry removed or changed.
