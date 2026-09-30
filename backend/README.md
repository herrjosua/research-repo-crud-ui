# Research Repo CRUD UI — Backend

Node/Express API for the CRUD UI. Handles auth, session management, and all
file CRUD against the [Agentic UX Research Repo](https://github.com/herrjosua/agentic-repo) by
shelling out to its Python scripts (and, where no script exists, editing
markdown files directly).

**Stack:** Express, `better-sqlite3` (users + sessions only — markdown files
remain the source of truth for research content), `express-session` +
`bcrypt` for auth, `gray-matter` for frontmatter parsing, Jest + supertest
for testing.

v0.6–v1.2 are complete (backend foundation through deploy). v1.3 is in
progress: its Ask the Repo was released as v1.3.6. See the root
[Roadmap](../README.md#roadmap) for milestones and
[`../docs/decisions.md`](../docs/decisions.md) for recent design decisions.

## Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Generate a session secret and paste it into `.env`:
```bash
openssl rand -base64 32
```
Find your agentic-repo venv's Python path (needed so the server calls the
right interpreter — one that has `python-frontmatter` installed — rather than
whatever bare `python3` resolves to on `PATH`, which can be another tool's
shim rather than a Python with the venv's packages):
```bash
cd /absolute/path/to/your/agentic-repo
source .venv/bin/activate
which python3
```
`.env` should end up looking like:
```
PORT=3001
NODE_ENV=development
SESSION_SECRET=<paste the generated value here>
AGENTIC_REPO_ROOT=/absolute/path/to/your/agentic-repo
PYTHON_BIN=/absolute/path/to/your/agentic-repo/.venv/bin/python3
DEMO_MODE=false
DEV_TOOLS_ENABLED=false
```
(`DEV_TOOLS_ENABLED=true` adds the dev-only provider toggle; see [Switching
providers without a restart](#switching-providers-without-a-restart-dev-only).)
**Never commit `.env`** — it's already covered by `.gitignore`. The server
refuses to start (`routes/records.js`) if `AGENTIC_REPO_ROOT` is unset.

**For local development, point `AGENTIC_REPO_ROOT` at a separate,
push-disabled clone of agentic-repo, not your real checkout.** Creating,
editing or deleting records in the app makes real commits in whatever repo
it points at (see [`../docs/decisions.md`](../docs/decisions.md) for the
incident that led to this):
```bash
git clone https://github.com/herrjosua/agentic-repo.git agentic-repo-dev
git -C agentic-repo-dev remote set-url --push origin no-push
```
`PYTHON_BIN` can keep pointing at your existing venv — the scripts run from
the clone, the venv only supplies the interpreter and its packages. To reset
the clone:
```bash
git -C agentic-repo-dev fetch && git -C agentic-repo-dev reset --hard origin/main
```

#### Ask the Repo (local Ollama)

**Ask the Repo** (`POST /api/ask`) is off unless `LLM_PROVIDER=ollama` is
set. It then needs a local [Ollama](https://ollama.com) at
`http://localhost:11434` with both models pulled. Install Ollama from
ollama.com and open it; if it offers to create an account, choose "No
thanks, I'll use Ollama locally". Then pull the models (about 5.7 GB in
total):
```bash
ollama pull nomic-embed-text   # embeddings
ollama pull gemma2:9b          # answers
```
Check the Ollama server is up — this should list both models:
```bash
curl http://localhost:11434/api/tags
```
Everything stays on this machine: no cloud calls, no API keys.
`OLLAMA_BASE_URL`, `OLLAMA_EMBED_MODEL` and `OLLAMA_CHAT_MODEL` override the
defaults. `LLM_PROVIDER=static` serves captured answers instead (next
section); any other value refuses to start. Leave `LLM_PROVIDER` unset in
production, or set it to `static` for the public demo; unset, the endpoint
returns `503`.

To check the setup against your real Ollama, run the live test (see
[Testing](#testing)). The request and response format is under [Ask the Repo
(v1.3.6)](#ask-the-repo-v136) below; for how the pieces fit together, see
[`../docs/architecture.md`](../docs/architecture.md).

#### Switching providers without a restart (dev only)

`LLM_PROVIDER` sets the provider Ask the Repo starts with. On a dev server
you can switch between `static` and `ollama` while it runs, from the **Dev**
toggle at the right of the Ask page's breadcrumb bar, or with
`POST /api/dev/provider` (see [Dev tools](#dev-tools-dev-only)). Set both in
`backend/.env`:

```
NODE_ENV=development
DEV_TOOLS_ENABLED=true
```

- **Where it works.** The `/api/dev` routes are registered only when
  `DEV_TOOLS_ENABLED` is exactly `true` **and** `NODE_ENV` is `development`
  or `test` (`devTools.js`). Anywhere else, including `NODE_ENV=production`
  or `NODE_ENV` unset, they're never registered, whatever the flag says, and
  the server logs why it ignored the flag. Never set `DEV_TOOLS_ENABLED` in
  production.
- **What a switch does.** The provider lives in the server process's memory
  (`ask/activeProvider.js`); a restart goes back to `LLM_PROVIDER`. `GET
  /api/ask/config` and `POST /api/ask` follow a switch immediately. A
  question already being answered finishes with the provider it started on.
  The static answers and the Ollama client are each loaded the first time
  they're needed and then kept, so switching back to `ollama` reuses the
  embeddings already computed.
- **Turning Ask on.** With `LLM_PROVIDER` unset, Ask the Repo starts off,
  and the toggle can turn it on (`static` or `ollama`). It can't turn it off
  again: the endpoint only accepts those two values. Restart without
  `LLM_PROVIDER` to turn it off.
- **Checks before switching.** To `ollama`: Ollama must answer
  `GET /api/tags` within 3 seconds and have both models pulled, or the switch
  fails with `502` saying which, and the provider doesn't change. To
  `static`: the answers file must be valid, or it fails with `500`.
- **In the browser.** The toggle is in the frontend only under `vite dev`
  (see `frontend/README.md`). A successful switch clears the Ask tab's
  conversations and resets the project to "All projects"; saved insights and
  pins stay.

#### Static answers for the public demo (`LLM_PROVIDER=static`)

The public demo has no model. With `LLM_PROVIDER=static`, Ask the Repo offers
a fixed list of questions, and each answer is a real, unedited output of the
local model, captured ahead of time. Visitors pick a question; nothing can be
typed, and a free-text `question` is rejected. The server never contacts
Ollama in this mode and doesn't need it installed. Answers come back
immediately, with no simulated delay. See [Ask the Repo](#ask-the-repo-v136)
below for the request and response.

The data lives in `ask/static/`:

- **`questions.json`** — the curated list the capture script reads:
  `[{ id, question, project }]`, where `project` is the `project-*` tag the
  question is asked under, or `null` for all projects. Its order is the order
  `GET /api/ask/config` lists them in.
- **`answers.json`** — what the server serves, written only by the capture
  script and checked in. `metadata` records the chat and embedding models,
  `capturedAt`, the agentic-repo commit the answers were captured against
  (`corpusCommit`) and the script's version. Each entry in `questions` has the
  question's `id`, `question` and `project`, plus the pipeline's `answer` and
  `sources` exactly as `POST /api/ask` returned them, and which capture `run`
  it is. With `LLM_PROVIDER=static` the server validates it at startup and
  refuses to start if it's missing or malformed; with `ollama` or unset it
  never reads the file. `tests/staticAnswers.data.test.js` checks it too.
  (`ASK_STATIC_ANSWERS_FILE` is **test-only**: under `NODE_ENV=test` it
  points the server at a fixture instead, and it's ignored everywhere else.
  Don't set it in any `.env`.)

**Capturing.** `scripts/capture-static-answers.js` runs each question through
the same pipeline as the live route (`ask/pipeline.js`), in process, against
your local Ollama and the checkout at `AGENTIC_REPO_ROOT`, both read from
`backend/.env`. The checkout must have no uncommitted changes, because its
commit is stamped into the metadata. Capture against the agentic-repo commit
the demo will serve.

```bash
cd backend
node scripts/capture-static-answers.js capture        # every question, 3 runs each (--runs N)
# read ask/static/review/report.md
node scripts/capture-static-answers.js publish        # writes ask/static/answers.json
```

`capture` keeps every run, verbatim and with the model's raw reply, in
`ask/static/review/runs.json` (git-ignored scratch). It also writes
`ask/static/review/report.md`: each run's answer with its `[n]` markers, and
under it each cited source's title, section, record id and excerpt, so you can
check every claim against its evidence. The report flags answers with no
citations, markers the model pointed at no source (the pipeline drops them
from the answer), citations whose excerpt shares few words with the
sentence citing it, numbers in the answer that no cited excerpt contains
(digits, percentages and "one" to "twenty", so "four" matches "4"; this
catches derived figures like "saved 10 minutes" from "15 to 5 minutes"), and
"N of M" counts no cited excerpt states (so "4 of 4" cited to "4 of 5" is
caught even though "4" appears). It also checks the citation-count bar (at least two
records, including a raw session). Whether a cited record actually supports
its claim is still for a person to judge.

`capture --seed N --temperature T` fixes the chat model's seed and temperature
for that capture only; the pipeline's own options (no seed, temperature 0.2)
are unchanged, and so are the defaults. Every capture records the Ollama
version, both models' digests, the seed and the temperature in `runs.json`
and at the top of the report, because a seed only reproduces an answer on
the same Ollama build and model weights. `capture --only` refuses to merge
runs captured with a different seed or temperature. These settings aren't
copied into `answers.json`.

`publish` copies one run per question in `questions.json` into
`answers.json`, unedited: by default the first run that meets the bar with no
flags, or the run you choose with `--pick <id>=<run>`. To drop a question,
remove it from `questions.json` before publishing. To redo a few questions,
`capture --only id,id` recaptures them and keeps the rest, provided the
corpus commit and models haven't changed. `report` rewrites the report from
`runs.json`, re-running its checks (`--only id,id` limits the report to
those questions); `publish --dry-run` shows which run each
question would get without writing anything.

**Checking the answers still match a clone.** `verify` reads
`answers.json` and, against the checkout at `AGENTIC_REPO_ROOT`, checks
that every cited source's record still exists (by its record id) and that
its excerpt still appears in that record's text (whitespace differences
ignored). It prints one line per miss and exits `1` if there are any, `0`
with an `OK:` line otherwise. It only runs `export_records.py` (read-only)
and needs no Ollama, so it runs anywhere the backend does:

```bash
cd backend
node scripts/capture-static-answers.js verify        # against the clone backend/.env points at
AGENTIC_REPO_ROOT=/path/to/another/clone node scripts/capture-static-answers.js verify
node scripts/capture-static-answers.js verify --answers path/to/answers.json   # another answers file
```

On the demo server, run the first form from the deployed checkout's
`backend/` directory with the Node the app runs under (see
[`../docs/deploy.md`](../docs/deploy.md)). Its `backend/.env` already
points `AGENTIC_REPO_ROOT` and `PYTHON_BIN` at the demo's clone, and a
variable set on the command line overrides it. Run it after the demo's
corpus changes, and before a release that changes `answers.json`. A miss
means an answer quotes text the demo no longer has: recapture, or drop
that question.

**When to re-run it.** Answers cite records by id and quote their text, so
recapture when the corpus the demo serves changes a lot: cited records are
edited, renamed or deleted, or enough new research lands that the answers are
out of date. Recapture after changing the prompt, retrieval, chat model or
embedding model too. Small unrelated edits don't need a recapture; the
answers stay true to the commit in `metadata.corpusCommit`. Commit
`questions.json` and `answers.json` together.

#### Evaluating answers (`scripts/eval-ask.js`)

A before/after harness for changes to chunking, retrieval or prompting.
It asks a fixed gold set of questions through the same
pipeline as the live route and judges each answer against what the corpus
says a correct answer cites and claims. **It's a manual report, not a CI
check**: it needs a real Ollama with the chat and embedding models pulled,
the agentic-repo clone at `AGENTIC_REPO_ROOT` with no uncommitted changes,
and `PYTHON_BIN` pointing at a Python with python-frontmatter (all read from
`backend/.env`, as for the server). Jest only checks the gold file's schema
and the pass/fail rules (`tests/askEval.test.js`), and the per-sentence
checks they rest on (`tests/askChecks.test.js`).

```bash
cd backend
node scripts/eval-ask.js run --label after-chunking --set regression  # seed 42, temperature 0.2, 3 seeded + 3 unseeded runs
node scripts/eval-ask.js report baseline after-chunking                # ask/eval/results/baseline-vs-after-chunking.md
node scripts/eval-ask.js run --label after-chunking-scenarios --set scenario
node scripts/eval-ask.js report baseline-scenarios after-chunking-scenarios
```

`run` writes the runs to `ask/eval/results/<label>.json` and a report to
`ask/eval/results/<label>.md`. A run of all 17 questions takes three to four
minutes with the model loaded. `--set regression|scenario` asks one
gold set's questions (all of them without it); `--seed`, `--temperature`,
`--seeded-runs`, `--unseeded-runs` and `--only id,id` change the defaults.
`report` re-judges stored runs against the current gold file, so editing
the gold set needs no re-run. With two labels it puts them side by side,
and it refuses unless both ask the same questions and share the harness
version, corpus commit, seed and temperature, so compare a `--set
regression` run with `baseline` and a `--set scenario` run with
`baseline-scenarios`. It warns when the Ollama version or a model digest
differs.

**Latency in the reports.** `run` embeds the whole corpus before it times
anything, so no reported latency includes corpus embedding. A question's
**cold** latency is its first seeded run (the first time that prompt is
sent), and its **warm** latency is the median of its seeded runs, with the
unseeded median alongside. The reports give cold latency as a mean and max
over the set: for gemma2:9b with the current retrieval, 4.1 / 6.7 seconds on
the regression set and 4.7 / 5.7 on the scenario set
(`v1.3.6.7-step5.md`, `v1.3.6.7-step5-scenarios.md`).

**The gold set** is `ask/eval/gold.json`, kept apart from `questions.json`.
It holds two sets, named by each entry's `set`:

- `regression` (10 questions): questions the pipeline has answered wrongly
  before (mostly from the corpus audit), kept to catch the errors coming back.
- `scenario` (7 questions, v1.3.6.26): questions a researcher or designer
  would ask, taken from the corpus coverage report. They are unscoped, cover
  documentation pain points, why physicians didn't trust the scribe's drafts,
  what nurses wanted from citations, how new admins expected the invite step
  to work, and two new behaviors. The premise check
  (`scenario-calendar-premise`) asks for evidence for making the calendar step
  required, and a correct answer says it already is required and that no
  record argues for requiring it. The open-questions entries
  (`scenario-care-coordinator-gaps`, `scenario-session-timeout-open`) ask what
  is still unknown; the raw notes list open items, so a correct answer lists
  them with citations and says what the data does show, and a decline fails
  (neither sets `acceptDecline`).

The report gives each set its own section, with its own pass counts; the two
are never added together.

Each entry has the question and project, the records that support a correct
answer (`supportingRecords`), the raw session it must cite if one holds the
answer (`requiredRawRecord`, or `null`), claims that must and must not
appear (case-insensitive regular expressions matched against the answer
without its `[n]` markers), and the evidence for all of these. An entry for a
question the corpus can't answer can set `acceptDecline: true` (see below). An entry is
`"draft"` until a person has reviewed it and set it to `"reviewed"`; the
report says how many are still drafts.

**Pass or fail** is judged on the first seeded run. A run passes when:

- every sentence has a citation, except declines, list intros ending in
  ":", and list items cited as a group (a marker line after the list, or a
  cited intro; a list whose one citation is on its last item still leaves
  the items above it uncited). A decline is "the sources don't say…", or any
  sentence with "not", "cannot" or "no" and the word "sources" ("The
  question cannot be answered from the provided sources."). Markers after a
  sentence's full stop belong to it ("…sessions. [1]"), unless a lowercase
  word follows them, when they open the next sentence ("…. [1] mentions
  that…");
- every figure and "N of M" count appears in the sources *that sentence*
  cites, not just somewhere in the answer. A cited source's title and
  section count as well as its excerpt, since the model is shown all three
  ("Participant in session 1…" citing a source under "Session 1 — Jan 19" is
  supported). A decline may repeat the question's own figures;
- it cites at least one supporting record, and the required raw session if
  there is one. On an `acceptDecline` entry, an answer that only declines and
  cites nothing is excused from the supporting-record rule, and only that one:
  its must and must-not claims (and any required raw session) still apply;
- every must-claim matches and no must-not claim does.

The first two rules (and the stack count below) are `ask/checks.js`, the same
checks the live route reports as `checks` (see [Ask the
Repo](#ask-the-repo-v136)); the capture script's figure flag uses its figure
rule too. They're pure functions of the answer, its sources and the question,
so `report` re-applies them to stored runs.

Per question, the report shows the records shown to the model and where the
first raw session ranks among all in-scope records (ranked by the pipeline's
own `rank()` with no cut-off: the plain similarity ranking, which matches
what the model was shown unless the provenance slot is on), the records
cited and
whether a raw session is among them, uncited sentences, sentences stacking
three or more citations, unsupported figures, the gold verdict and why,
whether the seeded runs were identical, how many distinct answers the
unseeded runs gave, latency, the capture script's review flags, and the
answer text, with the cited excerpts underneath. Stacks and unseeded
variation are reported but don't decide pass or fail.

Latency is reported twice: **cold**, the first seeded run, and the **median**
of the seeded runs. The seeded reruns send Ollama the same prompt, so they're
served largely from its prompt cache and often run several times faster than
the first; the cold figure is the one closer to what a person asking a new
question waits. (Cold is computed from the stored runs, so older results show
it too.)

Each set's totals also give the prompt size (system plus user message, in
characters) and cold latency as mean / max, and the sentences with unsupported
figures as well as the figures. Runs store their prompt size, each shown
record's passage id and each source's `participants` line, and results store
the `RETRIEVAL` settings; results from before these were recorded show "—".

`ask/eval/results/baseline.md` is the checked-in regression baseline for the
pipeline as of v1.3.6.22 (5 of 10 pass). `ask/eval/results/baseline-scenarios.md`
is the scenario baseline as of v1.3.6.26 (0 of 7 pass; the premise-check and
open-questions entries were written to fail on the answers of that time).
Adding the `set` field changed neither the harness version nor what `report`
compares, since a run doesn't store its entries' sets.
`ask/eval/results/v1.3.6.7-checks` and `v1.3.6.7-checks-scenarios` (with
their `baseline-vs-…` reports) re-ran both sets after the checks moved to
`ask/checks.js`: every seeded answer and every ranking is identical to the
baselines, and the pass counts are unchanged. One count moved on the same
answer: `scenario-calendar-premise`'s unsupported figures went from 1 to 0,
because "Participant in session 1…" cites a source whose section is
"Session 1 — Jan 19" (it still fails, on its other rules). Re-run them rather
than comparing across machines: identical seeded answers are only expected on
the same Ollama build and model digests.

**Other chat models (`--model`, v1.3.6.31).** `run --model NAME` asks with
another pulled Ollama chat model, for that process only, like `--seed` and
`--temperature`. Without it the model is `OLLAMA_CHAT_MODEL`, else
`gemma2:9b`, as for the server. The embedding model, retrieval and prompt
never change, so every model is shown exactly the same passages. Results
record the chat model, its digest, its Ollama capabilities and the Ollama
version, and `report` and `compare` refuse results from different corpus
commits, seeds or temperatures as before.

A model whose capabilities include `thinking` (qwen3) is asked with Ollama's
`think: false`; other models get the same request as always, so
`gemma2:9b` runs are unchanged (the `model-gemma2-9b` re-run gives every
seeded answer of `v1.3.6.7-step5` byte for byte). Whatever the model
returns, only `message.content` is the answer: Ollama returns reasoning in a
separate `thinking` field, which is never used, and a reply that opens with
a `<think>…</think>` block has that block removed (`finalAnswer()` in
`ask/ollama.js`). Each run also stores Ollama's token counts and timings
(`stats`) and how much thinking text came back (`thinkingChars`, which should
be 0), and each result the model's peak memory as `/api/ps` reports it after
each question. Reports add tokens per second (cold run), runs that returned
thinking text, peak model memory and wall time.

`--think LEVEL` sends that thinking level instead of `false`. gpt-oss takes
`low`, `medium` or `high` and can't turn thinking off: on Ollama 0.35.0 it
ignores `think: false` and thinks at its default level, medium. The harness
reads the values each model takes from `/api/show` (`thinking.values`).
It refuses a level the model doesn't list, `--think` on a model without
thinking, and a run without `--think` on a model whose values don't include
`false`. The level is stored in the results' `thinking` metadata and shown
in the report. Thinking text is expected then, and it is still never part
of the answer. Without `--think`, qwen3, gemma2 and gemma3 get exactly the
requests they did before.

```bash
node scripts/eval-ask.js run --label model-gemma3-27b --model gemma3:27b --set regression
node scripts/eval-ask.js run --label model-gemma3-27b-scenarios --model gemma3:27b --set scenario
node scripts/eval-ask.js run --label model-gpt-oss-20b-low --model gpt-oss:20b --think low --set regression
node scripts/eval-ask.js compare --label model-comparison \
  v1.3.6.7-step5 v1.3.6.7-step5-scenarios model-gemma3-27b model-gemma3-27b-scenarios
```

`compare` groups result sets by chat model (the first one is the base) and
writes `ask/eval/results/<label>.md`: pass counts and the other totals per
model and gold set, unseeded passes, cold latency, tokens per second and
memory, a warning when the sets ran on different Ollama versions, a
per-question grid with whether the gold evidence was in the prompt, the entries that fail on any model with every model's reasons, and
every model's answer.

The v1.3.6.31 bake-off (`model-comparison.md`, and
[decision 16](../docs/decisions.md)) ran `gemma3:27b` and `qwen3:32b`
against `gemma2:9b`'s step 5 results. Gold pass, regression / scenario:
gemma2:9b 6 / 0, gemma3:27b 3 / 0, qwen3:32b 3 / 0. Cold latency was 4 s for
gemma2, 17–30 s for the others, and peak memory 6.1, 16.3 and 20.6 GiB, so
gemma2:9b stays the default. `model-gemma2-9b[-scenarios]` is gemma2
re-run through `--model`: same seeded answers as step 5, plus its speed and
memory.

`gpt-oss:20b` was added at `--think low` (`model-gpt-oss-20b-low[-scenarios]`)
and passed 0 / 0, with 3 / 4 raw sessions cited. It was the fastest model:
3.9 s cold on the regression set and 5.8 s on the scenario set, at 60 tokens
per second. Its peak memory was 12.0 GiB.
- **How it fails:** mostly where it puts its citations. It groups them after
  a paragraph's last sentence, or leaves them out. A scratch re-judge that
  moves them back gives 2 / 1 (decision 16).
- **Ollama version:** it ran on Ollama 0.35.0, the others on 0.34.3. A
  gemma2 control on 0.35.0 reproduced all 10 regression seeded answers
  byte for byte.
- **Seed 42 doesn't fully reproduce gpt-oss:**
  - within a run, 2 of 17 questions' cold seeded run differed from the
    next two;
  - across two processes, 14 of 17 first seeded answers were
    byte-identical;
  - no verdict changed.
- **Not run:** medium, its default level.

For a production deployment, see
[`.env.production.example`](./.env.production.example) instead — it covers
the additional settings (`ALLOWED_HOSTS`, `TRUST_PROXY`, `HTTPS_REDIRECT`,
`FRONTEND_DIST`, `GIT_COMMITTER_NAME`/`EMAIL`) that only apply under
`NODE_ENV=production` — and [`../docs/deploy.md`](../docs/deploy.md) for the
full deploy runbook.

### 3. Run the server
```bash
cd backend
node server.js
```
You should see `Server listening on http://localhost:3001`. The SQLite
database file (`app.db`) and its tables are created automatically on first
run. If `DEMO_MODE=true`, the three demo users (see below) are also seeded
automatically at startup.

> **Note:** `server.js` lives in `backend/`, not the repo root. Running
> `node server.js` from anywhere else will fail with `MODULE_NOT_FOUND`.

### 4. Start the frontend
With the backend from step 3 still running, start the frontend in a second
terminal (run `npm install` there first if you haven't — see
[`../frontend/README.md`](../frontend/README.md)):
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` and sign in.

The Ask the Repo page asks `POST /api/ask` and reads its project list and
availability from `GET /api/ask/config`. With `LLM_PROVIDER=ollama` it answers
from the local model: the first question after a server start takes 10 to 20
seconds while the corpus is embedded and the model loads (after about 5
seconds the page says why), and later questions are faster. That figure is
the whole first question, including loading the models and embedding the
corpus; the checked-in evaluation results don't measure it. What they do
measure is under [Evaluating answers](#evaluating-answers-scriptseval-askjs). With
`LLM_PROVIDER` unset, the page says Ask the Repo isn't available in this
environment and disables asking; the rest of the app works as usual.
With `LLM_PROVIDER=static` it offers the captured questions to pick from
instead of a composer.

## Testing

```bash
npm test
```

Runs the full Jest + supertest suite. The `backend` job in
[`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the source of
truth for what actually runs — this list is a guide to what each file
covers, not a count to keep in sync:

- **`tests/auth.test.js`** — signup, login, logout, `/me`, the rate limiter
  (including the 6th attempt still being blocked even with the correct
  password), and demo mode (`GET /demo-users`, `POST /demo-login` for all
  three identities, and confirming `/signup`/`/login` correctly refuse
  under `DEMO_MODE`).
- **`tests/records.test.js`** — `POST /sessions` (raw mode), `GET
  /records`/`GET /records/:id`, `PUT /records/:id` (including the
  gray-matter date-coercion fix), `DELETE /records/:id` (including the
  raw-session-is-two-files case), and `GET /records/:id/history` (including
  `--follow` lineage across a delete-then-recreate under the same slug).
- **`tests/projectTags.test.js`** — agentic-repo's project tagging, against
  its own fixture corpus with a `research/projects.yml`
  (`tests/fixtures/projects-corpus/`): no `project-*` tag written into a raw
  session on create or edit, findings/analytics summaries/deliverables
  keeping exactly one through any edit, `projects.yml` committed with a new
  raw session, and a deleted raw session's entry removed (or skipped with a
  warning, never failing the delete).
- **`tests/gitScope.test.js`** — that each write commits only the files that
  request actually touched, and `routes/records.js`'s `withRepoLock` queue
  serializing concurrent writes to `AGENTIC_REPO_ROOT`.
- **`tests/production.test.js`** — `middleware/hostCheck.js`'s `421` on an
  unrecognized `Host`, `proxyTrust.js`'s trust-proxy setting, the HTTPS
  redirect switch, and serving the built frontend (`frontend.js`).
- **`tests/throwawayGuard.test.js`** — that the server refuses to start
  under `NODE_ENV=test` unless `AGENTIC_REPO_ROOT` points at a throwaway
  repo (`throwawayRepo.js`).
- **`tests/security.test.js`** — a dedicated adversarial suite across seven
  vectors: path traversal via `topicSlug`/`slug`, SQL injection on
  login/signup, oversized request bodies, tampered/malformed session
  cookies, XSS via markdown links, `helmet` headers/`robots.txt`/write-route
  rate limiting, and the HTTPS redirect middleware (tested directly with
  mock `req`/`res`/`next`, not through the running app — see the note in
  `middleware/httpsRedirect.js`). Found and fixed two real vulnerabilities
  (path traversal; an XSS gap in the agentic-repo's markdown renderer) and
  one information-leak bug found along the way (a generic Express error
  handler was missing, so any error — not just an oversized body — leaked a
  full stack trace including server file paths). See
  [Security notes](#security-notes) for the fixes.
- **`tests/health.test.js`** — `GET /api/health`: status, the
  `package.json` version, `startedAt`, `no-store`, and nothing else in the
  body.
- **`tests/ask.test.js`** — `POST /api/ask` through the real app and
  `export_records.py` over E2E's fixed corpus, against a fake Ollama that
  speaks Ollama's real HTTP API (`tests/helpers/fakeOllama.js`): the
  response contract, plain-text output, citation renumbering, the
  embedding cache (embed once, re-embed only an edited passage), the
  project filter, the `checks` flags, and the generic `502` when Ollama
  fails.
- **`tests/askChecks.test.js`** — `ask/checks.js` on answers the corpus
  audit and the baselines logged as wrong: invented figures, an uncited
  claim, a citation stack, a group-cited list, a decline repeating the
  question's figure, and a figure found only in a source's title or section.
- **`tests/ask.unit.test.js`** — cosine similarity, ranking, the embedding
  cache, chunking, kind/date mapping, the plain-text sanitizer, and
  citation parsing.
- **`tests/ask.disabled.test.js`** — `503` when `LLM_PROVIDER` is unset.
- **`tests/devTools.test.js`** — the dev-tools gate: registered only with
  `DEV_TOOLS_ENABLED=true` and `NODE_ENV` development or test; never under
  production or an unset `NODE_ENV` (a plain `404`), and the warning that
  says why a set flag was ignored.
- **`tests/devProvider.test.js`** — `POST /api/dev/provider` end to end:
  `401` signed out, `400` for anything but `"static"` or `"ollama"`
  (including a `text/plain` or form body), turning Ask on from unset, config
  and `POST /api/ask` following each switch, `502` naming why Ollama isn't
  usable (unreachable, an error, a missing model) with the provider
  unchanged, `500` for a bad answers file, a question in flight finishing on
  its own provider, and the embeddings kept across switches.
- **`tests/ask.static.test.js`** — `LLM_PROVIDER=static` against a fixture
  answers file: the config's `mode` and `questions`, answers by `questionId`
  in the live shape, `400` for free text, `404` for an unknown id, `401`
  when signed out, no request ever reaching a (fake) Ollama, and which
  `LLM_PROVIDER` values start the server.
- **`tests/staticAnswers.data.test.js`** — the checked-in
  `ask/static/answers.json`: valid, consistent metadata, the same questions
  as `questions.json`, and no `[n]` without a source.
- **`tests/staticAnswers.test.js`** — the answers-file validator and the
  capture script's review checks.
- **`tests/askEval.test.js`** — the evaluation gold set's schema (including
  the checked-in `ask/eval/gold.json`), the harness's pass/fail rules, and
  the seed/temperature override. The harness itself needs Ollama and isn't run
  by Jest.
- **`tests/ask.live.test.js`** — the same flow against a real local Ollama.
  Skipped unless `OLLAMA_LIVE=1` (`OLLAMA_LIVE=1 npx jest
  tests/ask.live.test.js`), so CI never needs Ollama.

**No backend test ever touches the real agentic-repo.** Every test file runs
against a disposable, git-initialized fixture repo created fresh per test
run (see `tests/helpers/setupTestRepo.js`), seeded by copying the actual
Python scripts (`new_research_session.py`, `export_records.py`,
`build_index.py`, `build_search_ui.py`, `md_render.py`) from the real
agentic-repo — so tests always exercise the current real script logic,
never a stale duplicate, with zero risk to real research content or git
history. This mirrors the same isolation principle as the public demo's
separate-repo strategy, just scoped down to a local,
throwaway fixture instead of a persistent synced GitHub repo.

**Test/dev database separation.** `db.js` and `app.js` both branch on
`NODE_ENV=test` (set automatically by Jest) to use a SQLite file scoped to
the current Jest worker (`app.test.<JEST_WORKER_ID>.db`) instead of the real
`app.db` — this prevents two test files running in separate worker
processes from racing on the same file (e.g. one file's per-test table wipe
deleting another file's test user mid-run). The separate end-to-end suite
(see [`../e2e/README.md`](../e2e/README.md)) reuses this same `NODE_ENV=test`
branching — Playwright starts its own backend instance with that flag set,
rather than reusing a real dev-mode server, so E2E runs never write real
signup/session data into `app.db` either. `JEST_WORKER_ID` is unset outside
Jest, so the E2E suite's runs all land in `app.test.0.db`.

## Project structure

```
backend/
├── server.js         Entry point — imports app.js, seeds demo users if DEMO_MODE=true, starts listening
├── app.js            Express app definition (middleware, routes, generic error handler) — exported separately from server.js so tests can import it directly via supertest, without a real port
├── db.js             better-sqlite3 connection + users table schema (test/prod db split via NODE_ENV)
├── demoUsers.js       The three demo identities (Priya/Sam/Jordan) — single source of truth for seeding, the demo-login allowlist, and what the picker UI receives
├── seedDemoUsers.js   Idempotently creates the demo users on startup, only when DEMO_MODE=true
├── frontend.js        Serves the built frontend (frontend/dist) from this same process in production, with an SPA fallback for client-side routes
├── proxyTrust.js       Cloudflare's published IP ranges plus the host proxy's own address, for Express's trust-proxy setting in production
├── throwawayRepo.js    Marks/detects a disposable agentic-repo checkout made by tests/helpers/setupTestRepo.js
├── projects.js         agentic-repo's project-tag rules (research/projects.yml): which project-* tags PUT keeps, and removing a deleted raw session's entry
├── devTools.js         The dev-tools gate (DEV_TOOLS_ENABLED=true and NODE_ENV development|test) and mountDevTools, which app.js calls
├── validation.js       Input validation for POST /sessions and PUT /records/:id frontmatter, mirroring agentic-repo's own field rules
├── ask/                Ask the Repo's RAG pipeline (used by routes/ask.js)
│   ├── config.js         LLM_PROVIDER switch (ollama | static)
│   ├── activeProvider.js The provider in use now: starts as LLM_PROVIDER, switchable on a dev server (routes/dev.js)
│   ├── pipeline.js       One question end to end; shared by routes/ask.js and the capture script
│   ├── checks.js         Citation and figure checks on an answer; the live response's `checks` and the eval harness's rules
│   ├── staticAnswers.js  Loads and validates the static demo's captured answers
│   ├── static/           questions.json (curated) and answers.json (captured) for LLM_PROVIDER=static
│   ├── eval/             The evaluation gold set (gold.json, validated by gold.js) and checked-in results/ reports
│   ├── ollama.js         Plain-fetch client for Ollama's /api/embed and /api/chat, plus a readiness check (/api/tags)
│   ├── corpus.js         export_records.py records → passages; kind/date mapping; metadata sections and roster headers
│   ├── retrieval.js      Cosine similarity, ranking, and the lazy in-memory embedding cache
│   ├── provenance.js     Which raw sessions a synthesis or doc record was built from, and the (off by default) provenance slot
│   ├── answer.js         Prompt and source labels, citation renumbering, and the Source objects returned
│   └── plainText.js      Flattens model output to plain text (no markdown/HTML passes through)
├── scripts/
│   ├── capture-static-answers.js  Captures ask/static/answers.json from the local model, with a review report
│   └── eval-ask.js                Evaluation harness: the gold set through the real pipeline, before/after reports (manual, needs Ollama)
├── middleware/
│   ├── requireAuth.js    401 unless logged in; shared by records.js and ask.js
│   ├── rateLimiter.js    In-memory, per-IP rate limiter factory; applied to /sessions and write routes on /records
│   ├── httpsRedirect.js  HTTP→HTTPS redirect, gated on NODE_ENV=production and X-Forwarded-Proto; extracted from app.js so it's unit-testable without reloading the whole app under a different NODE_ENV
│   └── hostCheck.js      Rejects requests whose Host header isn't in ALLOWED_HOSTS (421); off when ALLOWED_HOSTS is unset
├── routes/
│   ├── health.js    GET /api/health — status, version, startedAt; polled by scripts/deploy.sh
│   ├── auth.js      Signup / login / logout / me / demo-users / demo-login
│   ├── ask.js       POST /api/ask — Ask the Repo (local Ollama RAG, or captured answers when static), gated by LLM_PROVIDER
│   ├── dev.js       GET/POST /api/dev/provider — dev-only provider switch; mounted only when devTools.js allows
│   └── records.js   Sessions + file CRUD (shells out to agentic-repo's Python scripts); validates topicSlug/slug against a safe pattern before either reaches the Python scripts
├── tests/
│   ├── auth.test.js           Auth flow, rate limiting, and demo mode tests
│   ├── records.test.js        Records CRUD + history tests
│   ├── gitScope.test.js       Commit-scoping (only changed files) and the write-request lock/queue
│   ├── production.test.js     Host check, proxy trust, HTTPS redirect switch, and serving the built frontend
│   ├── throwawayGuard.test.js The NODE_ENV=test startup guard requiring a throwaway AGENTIC_REPO_ROOT
│   ├── health.test.js         /api/health tests
│   ├── security.test.js       Adversarial security tests (path traversal, SQL injection, oversized bodies, tampered cookies, XSS, security headers/robots.txt/rate limiting, HTTPS redirect)
│   ├── ask.test.js            POST /api/ask integration tests against a fake Ollama
│   ├── ask.unit.test.js       Similarity, embedding cache, chunking, sanitizer, citation tests
│   ├── ask.disabled.test.js   POST /api/ask with LLM_PROVIDER unset
│   ├── devTools.test.js       The dev-tools gate and where /api/dev is (never) registered
│   ├── devProvider.test.js    The dev-only provider switch, POST /api/dev/provider
│   ├── ask.static.test.js     GET /api/ask/config and POST /api/ask with LLM_PROVIDER=static
│   ├── staticAnswers.data.test.js  The checked-in static answers file (ask/static/answers.json)
│   ├── staticAnswers.test.js  The static answers validator and the capture script's review checks
│   ├── askEval.test.js        The eval gold set's schema and the harness's pass/fail rules
│   ├── askChecks.test.js      ask/checks.js on the audit's bad answers
│   ├── ask.live.test.js       POST /api/ask against a real local Ollama (OLLAMA_LIVE=1 only)
│   └── helpers/
│       ├── setupTestRepo.js   Creates/destroys the disposable fixture repo shared by every test file
│       └── fakeOllama.js      Local HTTP server speaking Ollama's /api/tags, /api/embed and /api/chat
├── .env.example              Template for required environment variables (development)
├── .env.production.example   Template for the additional settings NODE_ENV=production reads — see ../docs/deploy.md
└── app.db        SQLite file (git-ignored, created on first run; app.test.*.db files are the test-only equivalent)
```

## API

All routes below (except where noted) require a logged-in session (`401`
otherwise).

### Health (v1.2.7)

| Method | Path          | Body | Notes |
|--------|---------------|------|-------|
| GET    | `/api/health` | —    | Public, unauthenticated. `{ status: "ok", version, startedAt }` after a `SELECT 1` against the database; `503` with `status: "error"` if that fails. `version` is `backend/package.json`'s; `startedAt` is when this process loaded the app. `Cache-Control: no-store`. [`scripts/deploy.sh`](../scripts/deploy.sh) polls it to confirm a new release is live. |

### Auth (v0.6, extended in v1.2 for demo mode)

| Method | Path                     | Body                                    | Notes                                                                 |
|--------|--------------------------|-------------------------------------------|----------------------------------------------------------------------|
| POST   | `/api/auth/signup`       | `username, password, gitName, gitEmail` | Creates user, starts a session. Returns `403` when `DEMO_MODE=true`.  |
| POST   | `/api/auth/login`        | `username, password`                      | Rate-limited: 5 attempts / 15 min. Refuses the three demo usernames with `403` when `DEMO_MODE=true`. |
| POST   | `/api/auth/logout`       | —                                           | Destroys the session                                                  |
| GET    | `/api/auth/me`           | —                                           | Returns current user (`id, username, git_name, git_email, is_lead`) or `401` |
| GET    | `/api/auth/users`        | —                                           | Every user's `username` and `git_name`, ordered by username. Any logged-in user can call it (`401` otherwise); it feeds the lead-reassignment dropdown in the create and edit forms. Restricting it is planned. |
| GET    | `/api/auth/demo-users`   | —                                           | Public, unauthenticated. Returns the three demo identities (`username`, `displayName`, `role`) when `DEMO_MODE=true`, else `[]`. |
| POST   | `/api/auth/demo-login`   | `username`                                | Public, unauthenticated. Passwordless login for one of the three seeded demo usernames only (validated server-side against a fixed allowlist). `404` when `DEMO_MODE` isn't set; its own IP-based rate limiter (20 requests / 15 min). |

#### The lead role

A lead can attribute a record to someone else. Each user row has an
`is_lead` flag (`users.is_lead`, `0` by default, added by a startup
migration in `db.js`). Nothing in the API or UI sets it. In demo mode,
`seedDemoUsers.js` seeds it from `demoUsers.js`, where Jordan Lee (Research
Ops Lead) is the only lead; a demo user that already exists isn't
re-seeded, so a changed flag there doesn't reach an existing database.
Anyone else becomes a lead only by setting `is_lead = 1` on their row in
the database directly.

What it allows: setting a record's author field to someone other than
yourself. The field is `researcher` on raw sessions, findings and analytics
summaries, and `designer` on deliverables (`evaluator` on heuristic
evaluations). The rule is enforced in `routes/records.js`:

- `POST /api/sessions`: an empty `researcher` (raw mode) or `designer`
  (deliverable mode) defaults to you. A non-lead may set it only to their
  own `git_name`. Heuristic evaluations' `evaluator` isn't set at creation.
- `PUT /api/records/:id`: a non-lead may leave the field unchanged or set it
  to their own `git_name`.

Anything else from a non-lead gets a `400`.

### Records / File CRUD (v0.7)

| Method | Path                    | Body / Query                                          | Notes                                                       |
|--------|-------------------------|---------------------------------------------------------|-----------------------------------------------------------------|
| POST   | `/api/sessions`         | `{ mode: "raw" \| "deliverable", ... }`                | Wraps `new_research_session.py`. See field reference below. Rate-limited: 30 requests / 15 min per IP. |
| GET    | `/api/records`          | `?kind=raw\|finding\|component\|analytics\|deliverable`, `?summary=true` | Shells out to `export_records.py`. Both optional. `summary=true` passes `--summary`, which leaves out each record's rendered HTML and search text; the frontend's `useRecords` uses it. |
| GET    | `/api/records/:id`      | —                                                        | Single record by id (e.g. `raw:2026-09-15-foo`). 404 if not found. |
| PUT    | `/api/records/:id`      | `{ frontmatter?: {...}, content?: "..." }`             | Merges frontmatter, replaces content if given. Reruns `build_index.py`. Rate-limited: 30 requests / 15 min per IP. |
| DELETE | `/api/records/:id`      | —                                                        | Deletes the file (whole session folder for `kind: raw`). Reruns `build_index.py`. 204 on success. Rate-limited: 30 requests / 15 min per IP. |
| GET    | `/api/records/:id/history` | —                                                     | Full edit history via `git log --follow`. Array of `{ hash, authorName, authorEmail, date, message }`, newest first. |

### Ask the Repo (v1.3.6)

| Method | Path       | Body                                   | Notes |
|--------|------------|----------------------------------------|-------|
| GET    | `/api/ask/config` | — | What the Ask tab needs up front: whether asking works here, and the project list. Always `200` for a signed-in user (never `503`); `401` when signed out. |
| POST   | `/api/ask` | `{ question: string, project?: string }`, or `{ questionId: string }` when static | RAG over every record, answered by a local Ollama; with `LLM_PROVIDER=static`, a captured answer. `503` when no provider is active (`LLM_PROVIDER` unset, and not switched on by the dev toggle); `502` if Ollama is unreachable or fails. |

**`GET /api/ask/config`** responds:

```jsonc
{
  "enabled": true,  // true when a provider is active (LLM_PROVIDER, or a dev switch); false means POST /api/ask answers 503
  "mode": "live",   // "live" (ollama), "static", or null when disabled
  "projects": [
    { "id": "project-onboarding", "label": "Onboarding", "count": 21 },
    …,
    { "id": "project-cross-cutting", "label": "Cross-cutting", "count": 25 }
  ]
}
```

- `projects` has one entry per project under `projects:` in
  `research/projects.yml`, in that file's order, with `project-cross-cutting`
  moved last.
- `id` is the full tag, exactly what `POST /api/ask`'s `project` filter matches.
- `label` is read from `projects.yml` (parsed with the YAML engine
  `gray-matter` already bundles). `export_records.py` outputs each record's
  project tag but not project names, so the file is the only place labels exist.
- `count` is how many records from `export_records.py --summary` carry the tag.
  That includes raw sessions and components, whose tag the script adds from
  `projects.yml`.
- A checkout without `research/projects.yml` (the e2e and default test
  corpora) has project tagging off, so `projects` is `[]`. The export isn't run
  at all in that case. An unreadable or malformed file is logged as a warning
  and also gives `[]`.
- With `LLM_PROVIDER=static` the response also has `questions`, the captured
  questions in `ask/static/questions.json` order:

  ```jsonc
  "questions": [
    { "id": "scribe-session-lock", "question": "What happened when the session locked during dictation?", "project": "project-ambient-scribe" },
    …
  ]
  ```

  `project` is the `project-*` tag the question was captured under, or
  `null` for all projects. `projects` is still listed. It also has
  `capture`, from `answers.json`'s `metadata`: the chat model that produced
  the answers and when, which the Ask tab shows under its question picker:

  ```jsonc
  "capture": { "model": "gemma2:9b", "capturedAt": "2026-09-28T17:36:53.970Z" }
  ```

  `questions` and `capture` are absent in the other modes.

`question` is 1–2000 characters. `project` is optional: omitted, `null` or
`"all"` searches the whole repo; anything else must be a tag slug
(`^[a-z0-9-]+$`) and only records carrying that tag are searched. (Records
have no project field yet, so a tag is the closest real grouping. If no
record has the tag, the answer says so and the model isn't called.)

**Response (`200`)** is the contract the frontend wires against:

```jsonc
{
  "answer": "Physicians read every line before accepting it [1]. …",
  "sources": [Source, …],
  "model": "gemma2:9b",
  "checks": {                // live mode only (v1.3.6.7); additive
    "retried": false,
    "uncited": [],
    "unsupportedFigures": [],
    "stacked": []
  }
}
```

- `answer` is **plain text**. Paragraphs are separated by `\n\n` (the split
  `AssistantMessage` already does); lists use `- ` / `1. `; there is no
  markdown or HTML. Citations are `[n]` markers where `[n]` is
  `sources[n - 1]`.
- `sources` holds **only the passages the answer cites**, in `[1]`, `[2]`, …
  order. It is `[]` when the answer cites nothing, e.g. when the repo
  doesn't cover the question.
- `checks` flags problems in the answer; it never changes the answer. It's
  additive: a client that ignores it is unaffected, and the frontend does.
  Computed by `ask/checks.js`, the same rules the evaluation harness judges
  by (see [Evaluating answers](#evaluating-answers-scriptseval-askjs)):
  - `retried`: always `false` for now; nothing is regenerated.
  - `uncited`: sentences that need a citation and have none. Declines ("the
    sources don't say…", or "not", "cannot" or "no" with the word
    "sources"), list intros ending in ":" and list items cited as a group are
    exempt.
  - `unsupportedFigures`: numbers and "N of M" counts (as `"3 of 5"`) that
    the sources *their own sentence* cites don't contain, in title, section
    or excerpt; one entry per sentence a figure appears in. A decline may
    repeat the question's figures.
  - `stacked`: sentences citing three or more distinct sources.

  Each list is `[]` when there's nothing to flag, including when the model
  wasn't called (no record has the project tag) or returned nothing. A
  figure the cited source does contain but in another sense (52% of
  physicians ranking documentation first, restated as "52% report burnout")
  isn't caught. **Static mode doesn't add `checks`**: it returns the
  captured `{ answer, sources, model }` exactly.

`Source` is the shape the Ask tab's sources rail and detail modal render
(examples in `frontend/src/ask-the-repo/fixtures/messages.js`), plus fields
identifying the real record:

| Field           | Type             | Notes |
|-----------------|------------------|-------|
| `id`            | string           | `"<recordId>#<passage>"`, unique per cited passage and stable while the record is unchanged. |
| `kind`          | string           | One of `KIND_META`'s kinds: raw `interview` → `interview`, raw `survey` → `survey`, other raw sessions → `transcript`, findings/analytics → `synthesis`, deliverables/components → `doc`. |
| `title`         | string           | The record's title. |
| `excerpt`       | string           | The cited passage, verbatim from the record (≤ ~600 chars, may contain `\n`). |
| `project`       | string \| null   | The request's `project` filter, echoed back, or `null` when unfiltered. The same on every source in a response. |
| `recordProject` | string \| null   | The cited record's own `project-*` tag (e.g. `project-onboarding`), or `null` if it has none (a checkout without `projects.yml`). Use this, not `project`, to say which project a source belongs to: under an unfiltered question `project` is always `null`. |
| `date`          | string \| null   | `"Jan 14, 2025"`, the format the Ask tab shows; `null` if the record has no date. |
| `contextBefore` | string \| null   | The record text just before the excerpt (≤ ~400 chars, `…`-clipped). |
| `contextAfter`  | string \| null   | The record text just after it. |
| `section`       | string \| null   | The heading the excerpt sits under. |
| `participants`  | string \| null   | A raw session's roster as one line, exactly as the model was shown it, e.g. `"Participants: 3 — Care Coordinator ×2, Care Coordinator (float pool) ×1"`; `null` for every other record and for a session without a roster. |
| `recordId`      | string           | For `GET /api/records/:id`, e.g. `raw:2025-02-25-usability-test-…`. |
| `recordKind`    | string           | `raw` \| `finding` \| `component` \| `analytics` \| `deliverable`. |
| `recordType`    | string \| null   | e.g. `usability-test`, `personas`. |
| `score`         | number           | Cosine similarity of the passage to the question. |

There is no `page` field (markdown records have no pages); the design's
fixtures have one, and `SourceCard` shows it only when present.

**How it works.** Every question re-reads the corpus through
`export_records.py` (about 0.1s), like `GET /api/records`, splits each record
into passages of up to ~600 characters that never cross a heading, and embeds
them with `nomic-embed-text`. Embeddings are cached in memory, keyed by a hash
of each passage's text, and built lazily: the first question embeds the whole
corpus (a few seconds warm, plus the model's load time if Ollama evicted it)
and later questions embed only the question. A record edited through the
CRUD routes is re-embedded on the next question, just the passages that
changed, with no invalidation hook. Deleted passages leave the cache. The
reply is flattened to plain text (`ask/plainText.js`), and its citations are
renumbered to match `sources`.

**Retrieval.** The settings are `RETRIEVAL` in `ask/pipeline.js`, and the
evaluation harness records them with every result:

- **Metadata sections are never retrieved.** Sections that describe a record
  rather than hold its evidence are split into passages but not embedded or
  ranked (`ask/corpus.js`, `METADATA_SECTIONS`): a raw session's
  `Participants — <title>` roster and `Related` list, a finding's
  `Evidence Trail` and `Related Findings`, a component's `Code mapping` and
  `Related Research Findings`, and a raw session's heading-less one-line
  `Researcher: …` passage. They match questions on names and titles alone,
  so they used to outrank real evidence. That's 117 of the corpus's 548
  passages, so the first question embeds 431 (counted at agentic-repo
  commit 4ba145f, the corpus the 2026-09-29 evaluation runs record). They stay in the record for
  a cited passage's surrounding context and for the provenance links below.
  The onboarding session's own `Participants` section, which is prose
  evidence, stays retrievable.
- **Rosters become a header.** Each passage of a raw session carries its
  roster as one line (`Participants: 3 — Care Coordinator ×2, Care
  Coordinator (float pool) ×1`), shown to the model under the source's label
  and returned as the source's `participants`. Roles get a `×n` count only
  when the roster lists one line per participant; otherwise the roles are
  listed without counts, since most rosters list each role once whatever the
  head count.
- **Top k.** The question is scored against every retrievable passage by
  brute-force cosine similarity, records are ranked by their best passage,
  and the top 6 records go to `gemma2:9b`: two passages for a raw session,
  one for anything else (below).
- **Labels.** Each source reaches the model as
  `[n] RAW SESSION · <method> · <date> — <title> — <section>`, or
  `SYNTHESIS · <date> — …` (findings, analytics) or `DOC · <type> · <date> — …`
  (deliverables, components), with parts a record lacks left out. The prompt
  tells the model to prefer raw sessions for quotes and counts, and to cite
  one or two sources per sentence.
- **Off by default: the provenance slot** (`provenanceSlot`). When on, and
  none of the top k is a raw session that a shown synthesis or doc record
  was built from, the best-ranked such session from below the cut-off
  replaces the lowest-ranked non-raw record and is shown last. It never
  replaces the only shown record linking to the session it adds. The links
  (`ask/provenance.js`) are a raw session's `Synthesized into: <slug>.md`, a
  `raw/<date-slug>` path in a record's text or links, a raw session's exact
  title in a finding's Evidence Trail, and a raw session's
  `related_components`. It's off because it cost a passing answer and gained
  none; see [decision 15](../docs/decisions.md#15-retrieval-changes-for-raw-session-evidence).
- **Two passages per raw session** (`passagesPerRaw: 2`). Each raw session
  in the top k shows its two best-scoring passages, in the order they
  appear in the record; synthesis and doc records show one. A session's
  best-scoring passage is often its Objective or Recommendations while the
  counts or quotes sit elsewhere. In the evaluation it lost no answer and
  gained one, `scribe-sound-alike-names`, but that gain is incidental: the
  second passage was the session's Method, not the Key Findings holding
  its counts, and the answer passed because its rewording cited the
  session's Objective. The real effect is that the gold evidence came into
  view for four failing entries (the burnout survey's quotes, the prior-auth
  v1 "inline source citations" recommendation, the chart-review quote, the
  onboarding sessions 4–6), and the model still doesn't use it. It makes the
  prompt about 20–25% longer (mean 4,837 regression and 5,521 scenario
  characters, max 7,378). See decision 15.

The final defaults are **k = 6, metadata sections excluded, provenance slot
off, `passagesPerRaw: 2`**.

**Static mode (`LLM_PROVIDER=static`).** `POST /api/ask` takes
`{ "questionId": "<id from config's questions>" }` and returns that
question's captured answer in the same `{ answer, sources, model }` shape,
with the same `Source` objects, byte for byte what the live pipeline
returned at capture time (`model` is the capture's chat model). It needs a
session like the live endpoint (`401` otherwise). A request with a
`question` field is free text and gets `400`; a missing or non-string
`questionId` gets `400`; an id that isn't in `answers.json` gets `404`. Any
`project` is ignored, because each captured question carries its own. No
model is called, so there's no `502`. See [Static answers for the public
demo](#static-answers-for-the-public-demo-llm_providerstatic) for where the
answers come from.

### Dev tools (dev only)

Registered only when `DEV_TOOLS_ENABLED=true` **and** `NODE_ENV` is
`development` or `test`; otherwise these paths don't exist (a signed-in
request gets the usual JSON `404`). See [Switching providers without a
restart](#switching-providers-without-a-restart-dev-only).

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET  | `/api/dev/provider` | — | `{ provider: "static" \| "ollama" \| null }`: the provider Ask the Repo answers with now (`null`: off). |
| POST | `/api/dev/provider` | `{ provider: "static" \| "ollama" }` | Switches the provider for this server process until it restarts, and responds `{ provider }`. `400` for any other value or a body that isn't JSON (the provider is unchanged); `502` when switching to `ollama` and Ollama isn't reachable or lacks a model (the message says which; unchanged); `500` when switching to `static` and the answers file is invalid (unchanged). |

### Git attribution (v0.8)

`POST /sessions`, `PUT /records/:id`, and `DELETE /records/:id` each commit
their change to the agentic-repo, attributed to the logged-in user (not the
machine's own git identity). `--author "<git_name> <git_email>"` is set from
the user's row in the `users` table; the **committer** stays whatever this
machine's local `git config` already is — that split is intentional, so
individual users never need git configured on the machine running the
server. A record's edit + any `build_index.py`-regenerated index files land
in **one atomic commit**, not two.

`PUT` additionally stamps `last_edited_by` / `last_edited_at` directly into
the record's frontmatter, for fast display without a git call, and both
fields are returned by `GET /records`/`GET /records/:id` as well (via a
shared `_edit_fields()` helper in `build_search_ui.py`, applied across all
five record-loader functions — raw, findings, components, analytics, and
deliverables). Both fields default to `null` for a record that's never been
edited via `PUT`, keeping every record's JSON shape identical either way.
One caveat: component records are regenerated from `tokens.tokens.json`, so
a `PUT` edit's attribution there would be lost the next time that
regeneration runs.

**Route pattern note:** because a record id can contain a slash (any
deliverable id, e.g. `deliverable:personas/foo`), `GET`/`PUT`/`DELETE
/records/:id` and `GET /records/:id/history` use Express 5's named wildcard
(`*splat`) rather than a plain `:id` param, and parse the id out of
`req.path` directly. The `/history` route must stay registered *before* the
generic `/records/*splat` route — Express matches top-down, and the
wildcard would otherwise swallow `/history` as part of the id.

**`POST /api/sessions` fields:**

- **`mode: "raw"`** — `title, type, topicSlug` required; optional `tags`, `relatedComponents`, `relatedFindings`, `researcher`, `methodLabel`, `date`, `content` (full markdown body — overrides the default TODO-scaffold template entirely if given)
- **`mode: "deliverable"`** — `folder, title, slug` required; optional `tags`, `relatedFindings`, `date`, `status`, `sourceType`, `protoType`, `description`. Always runs with `--no-prompt` since the API can't answer interactive prompts.
- **`topicSlug` (raw mode) and `slug` (deliverable mode) must match ****`^[a-z0-9-]+$`**** — rejected with ****`400`**** otherwise.** Both values end up building a filesystem path inside `new_research_session.py`, which does no sanitization of its own; adversarial testing confirmed a `../`-chain payload could write real files outside the intended folder entirely, and an absolute path could discard the base path completely. This validation happens in `records.js`, before either value ever reaches the Python script.

**PUT/DELETE behavior:** no Python script exists for editing or deleting
records, so these two routes read/write/delete the markdown file directly in
Node (using `gray-matter` for frontmatter), then shell out to
`build_index.py` to refresh the generated indexes. **The git commit always
happens once the file write itself succeeds, regardless of what
`build_index.py` does afterward** — an earlier version only committed inside
`build_index.py`'s success path, meaning any reindex failure (a warning *or*
a crash) silently skipped the commit entirely, even though the real file
change was already saved to disk. If `build_index.py` reports an issue, the
response is still `200`/`204` with a `warning` field, but that's now purely
informational — it never affects whether the change gets committed.

**Project tags (agentic-repo's `research/projects.yml`).** Only when that
file exists in the checkout; otherwise none of this happens. A raw
session's project comes from `projects.yml`, so `POST /sessions` and `PUT`
strip `project-*` tags from a raw session's `tags` rather than writing them
into `raw/`. On a finding, analytics summary or deliverable, `PUT` keeps the
file's existing `project-*` tag and ignores any the request adds, changes or
removes; a record with none keeps none. `new_research_session.py` adds each
new raw session to `projects.yml`, and `POST /sessions` commits that line
with the session. `DELETE` of a raw session removes its `projects.yml` line
(a one-line text edit, so comments and formatting survive) and commits it;
if the file can't be edited safely it logs a warning and the delete goes
ahead. If `projects.yml` already had uncommitted edits, neither route
commits it, so those edits stay uncommitted.

**Frontmatter dates stay plain dates.** `gray-matter`'s underlying YAML
library silently upgrades a plain `date: 2025-01-14` frontmatter value into
a full JS `Date` object on parse, then re-serializes it as a full ISO
timestamp (`2025-01-14T00:00:00.000Z`) on every `PUT` — even edits that never
touch `date` at all. `PUT` now detects any `Date`-instance frontmatter field
right before writing and coerces it back to a plain `YYYY-MM-DD` string, so
an edit to, say, just `status` doesn't silently rewrite an unrelated field's
format.

**Raw sessions are two files, not one.** `new_research_session.py` creates
`session-notes.md` and `participants.md` together in one dated folder.
`DELETE` is folder-aware: for a `kind: raw` record it removes the whole
session folder (`fs.rm(..., { recursive: true })`), not just
`session-notes.md` — an earlier version only deleted the one file and
silently orphaned `participants.md`; this is now fixed and covered by
testing.

Auth uses signed, httpOnly session cookies (via `express-session` +
`better-sqlite3-session-store`) — not JWT. Test with `curl` using `-c
cookies.txt` / `-b cookies.txt` to persist the cookie across requests.

## Security notes

- Passwords hashed with `bcrypt` (cost factor 12)
- Session ID regenerated on login/signup (prevents session fixation)
- Cookies: `httpOnly`, `sameSite: lax`, `secure` in production
- Auth is hand-rolled (`express-session` + `bcrypt`), not a library — Lucia
  Auth was originally considered but is deprecated as of March 2025
- Session store uses `better-sqlite3-session-store`, not `connect-sqlite3`,
  to avoid a vulnerable `sqlite3`/`node-gyp`/`tar` dependency chain
- All `/api/sessions`, `/api/records` and `/api/ask` routes require an
  authenticated session
- There are no CSRF tokens. Cross-site requests are stopped by the
  `sameSite: lax` session cookie and by the API taking JSON bodies only:
  `express.json()` parses only `application/json`, which a page on another
  origin can't send without a CORS preflight this app never answers. A
  `text/plain` or form body arrives empty and is rejected (`400`), which
  `tests/devProvider.test.js` checks for the dev provider switch
- The dev-only `/api/dev` routes (the provider switch) are registered at
  startup only with `DEV_TOOLS_ENABLED=true` and `NODE_ENV` development or
  test (`devTools.js`), and never otherwise, so there's no runtime permission
  check to get wrong. They also require a session
- `POST /api/ask` never passes model output through raw: the answer is
  flattened to plain text server-side (HTML tags and `<script>`/`<style>`
  contents removed, markdown unwrapped) before it's returned, and Ollama
  errors are logged server-side and returned as a generic `502`. Record text
  is given to the model as data, with instructions to ignore any
  instructions inside it
- `topicSlug`/`slug` are validated against `^[a-z0-9-]+$` before ever
  reaching `new_research_session.py`, preventing path traversal (see above)
- `app.js` includes a generic JSON error-handling middleware — any error
  (a `413` from an oversized body, a malformed-JSON `SyntaxError`, or
  anything else) responds with a plain `{ error: ... }` message and never a
  stack trace, regardless of `NODE_ENV`
- Demo mode (`DEMO_MODE=true`) closes `/signup` and password-based login for
  the three demo identities entirely; the only way in is
  `POST /demo-login`, validated against a fixed, hardcoded username
  allowlist server-side and covered by its own IP-based rate limiter
- A dedicated adversarial test suite (`tests/security.test.js`) exercises
  path traversal, SQL injection, oversized bodies, tampered cookies, and
  XSS directly against the running app — see the Testing section above
- `helmet` sets standard security headers (CSP, `X-Frame-Options`,
  `X-Content-Type-Options`, HSTS, etc.) on every response
- `robots.txt` disallows all crawling, since this is a portfolio-facing demo
  deploy rather than something meant to be indexed
- `POST /sessions`, `PUT /records/*`, and `DELETE /records/*` are rate
  limited (30 requests / 15 min per IP, in-memory) via a shared
  `middleware/rateLimiter.js` — separate from the stricter login/demo-login
  limiters noted above, since these guard the actual write endpoints rather
  than auth attempts
- HTTPS is live in production, terminated by an edge proxy in front of the
  host; how the public host and its edge are configured lives outside this
  repo. `trust proxy` (production only) is set to the host's own proxy
  address plus the edge's published IP ranges (`proxyTrust.js`, which lists
  Cloudflare's), so `req.ip` and `req.secure` reflect the real visitor
  rather than the last hop. The app's own HTTP→HTTPS redirect
  (`middleware/httpsRedirect.js`) stays off by default
  (`HTTPS_REDIRECT=false`), for an edge that already enforces HTTPS — see
  `.env.production.example` for when to turn it on instead
- `middleware/hostCheck.js` rejects any request whose `Host` header isn't in
  `ALLOWED_HOSTS` with `421`, registered before every other middleware so
  nothing downstream ever acts on a hostname the app doesn't own
