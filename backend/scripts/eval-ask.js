#!/usr/bin/env node
// Ask the Repo evaluation harness: runs the gold set (ask/eval/gold.json)
// through the real pipeline and writes a pass/fail report, so a change to
// chunking, retrieval or prompting can be measured before and after. A
// manual report, not a CI check: it needs a real Ollama and the agentic-repo
// clone. See backend/README.md, "Evaluating answers".
//
//   node scripts/eval-ask.js run --label NAME [--model NAME] [--think LEVEL] [--seed 42]
//                                [--temperature 0.2] [--seeded-runs 3] [--unseeded-runs 3]
//                                [--set regression|scenario|rationale] [--only id,id]
//                                [--whole-raw-notes N] [--follow-ups shown|linked]
//                                [--corrections shown|off] [--behaviors none|name,name]
//   node scripts/eval-ask.js run --provider bedrock --label NAME [--model PROFILE_ID]
//                                --max-cost USD --pass-rule-file PATH --pass-rule-sha256 HASH
//                                [--set ...] [--only id,id] [retrieval and --behaviors flags as above]
//   node scripts/eval-ask.js report BEFORE [AFTER] [--across-settings]
//   node scripts/eval-ask.js compare --label NAME BASE [OTHER ...] [--across-settings]
//   node scripts/eval-ask.js prompt-sources
//
// run     Asks every gold question --seeded-runs times with the fixed seed and
//         --unseeded-runs times without one, both at --temperature, through
//         ask/pipeline.js in process (the chat options are overridden for
//         this process only). Writes the runs to ask/eval/results/NAME.json
//         and the report to ask/eval/results/NAME.md. Pass or fail is decided
//         on the first seeded run; the unseeded runs only count distinct
//         answers. --set asks only one gold set's questions (without it,
//         the regression and scenario sets; rationale runs only with --set
//         rationale), --only only the ids given (within --set, if both are
//         given). --model sets the chat
//         model for this process only (default OLLAMA_CHAT_MODEL, else
//         gemma2:9b); the embedding model is never changed. A model whose
//         Ollama capabilities include "thinking" is asked with think: false
//         (any other model gets the request it always did), and every run
//         stores Ollama's token counts and how much thinking text came back.
//         --think LEVEL sends that thinking level instead (gpt-oss takes
//         low, medium or high, and can't turn thinking off with false), and
//         a model whose levels don't include false needs it.
//         --whole-raw-notes N runs the pipeline with RETRIEVAL.wholeRawNotes
//         set to N for this process only (ask/pipeline.js: the whole notes of
//         the top N raw sessions instead of their passages); the metadata's
//         `retrieval` records it.
//         --follow-ups shown|linked runs with RETRIEVAL.followUps set to
//         that for this process only (ask/pipeline.js: a question that asks
//         what is unresolved is also shown the Follow-ups / Open Questions
//         passages of its raw sessions, and with linked those of the raw
//         sessions linked to its two best-ranked synthesis records). The
//         metadata's `retrieval` records it, and each run `followUps`:
//         whether the question fired the trigger and the passage ids added.
//         --corrections shown|off runs with RETRIEVAL.corrections set to
//         that for this process only (ask/pipeline.js: a shown raw session
//         also shows all its correction passages; off is the default, so
//         shown is the one that changes anything). The metadata's `retrieval`
//         records it.
//         --behaviors runs with exactly the named prompt behaviors on and
//         the rest off (ask/answer.js PROMPT_BEHAVIORS: premise-check,
//         open-items, decline-with-evidence, list-format; `none` turns them
//         all off) for this process only; without it, the defaults. The
//         metadata's `promptBehaviors` records them.
//         --provider bedrock (default ollama, everything above) asks Amazon
//         Bedrock's Converse API instead (ask/bedrock.js), the embeddings
//         still from Ollama. --model is then an inference profile ID
//         (default BEDROCK_MODEL_ID); BEDROCK_REGION, BEDROCK_MAX_TOKENS and
//         BEDROCK_EFFORT apply as for the server. There is no seed and no
//         temperature, so --seed, --temperature, --seeded-runs,
//         --unseeded-runs and --think are refused. Before any call it checks
//         the AWS identity (STS GetCallerIdentity) is the ux-research-demo
//         IAM user and refuses anything else. Each entry is asked by the
//         three-then-five pass rule (threeThenFive below), whose description
//         --pass-rule-file must hash to --pass-rule-sha256. --max-cost USD
//         is required: each call's cost is its usage at BEDROCK_PRICING, and
//         the run stops before a call once the total reaches it, saving what
//         it has.
// report  Re-judges stored runs against the current gold file (so editing
//         the gold set needs no re-run) and rewrites the report. With two
//         names it writes a before/after report to ask/eval/results/
//         BEFORE-vs-AFTER.md, and refuses unless both share the harness
//         version, corpus commit, seed, temperature and provider (a set
//         without one is ollama). --across-settings allows a different
//         seed, temperature or provider (a Bedrock set against a seeded
//         Ollama one), with a banner listing every setting that differs;
//         each set is judged by its own pass rule.
// compare Several result sets side by side, grouped by chat model (a
//         model's regression and scenario runs are usually two sets), the
//         first set's model as the base: pass counts, speed and memory per
//         model, and each entry that fails on any model with every model's
//         verdict and whether the gold evidence was in the prompt. Writes
//         ask/eval/results/NAME.md. Refuses sets that differ in harness
//         version, corpus commit, seed, temperature or provider, like
//         report, and takes --across-settings like it.
// prompt-sources
//         Rebuilds ask/eval/prompt-sources/<corpus commit>.json from the
//         corpus checkout (read only) for every stored result at its
//         commit: the label dates and shown passages the checks read, which
//         stored runs don't keep. report, compare and run need it; run
//         extends it itself. Checks the rebuild against the stored cited
//         excerpts and prompt sizes.
//
// Both report each gold set (regression, scenario) in its own section with
// its own pass counts, taking an entry's set from the current gold file.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { createOllamaClient, OLLAMA_DEFAULTS } = require('../ask/ollama');
const { createBedrockClient, BedrockError, redact } = require('../ask/bedrock');
const { resolveBedrockConfig } = require('../ask/config');
const {
    loadRecords, chunkRecord, participantsHeader, wholeNotesText, formatDate,
} = require('../ask/corpus');
const { createEmbeddingIndex } = require('../ask/retrieval');
const { createAskPipeline, CHAT_OPTIONS, RETRIEVAL } = require('../ask/pipeline');
const { PROMPT_BEHAVIORS, buildMessages } = require('../ask/answer');
const {
    analyseAnswer, summariseSentences, normalizeText, MARKER_RE,
} = require('../ask/checks');
const { loadGold, GOLD_FILE, GOLD_SETS } = require('../ask/eval/gold');
const {
    reviewRun, corpusCommit, ollamaInfo, withChatOptions,
} = require('./capture-static-answers');

const RESULTS_DIR = path.join(__dirname, '..', 'ask', 'eval', 'results');
const PROMPT_SOURCES_DIR = path.join(__dirname, '..', 'ask', 'eval', 'prompt-sources');
// Bump when what `run` stores or how it runs the pipeline changes; `report`
// only compares results from the same version. An entry's gold set isn't
// stored with its runs (the report reads it from the gold file), so adding
// sets didn't change it. Nor did v1.3.6.7: the checks moving to
// ask/checks.js are re-applied by `report`, cold latency is the stored first
// seeded run, and the pipeline's rank() is the same ranking as before. Nor
// did RR-103's retrieval changes: runs now also store `promptChars`, the
// metadata `retrieval`, a source's `participants` line and a shown
// record's `passage` id, all optional, and the report shows "—" for results
// stored without them, so older results still compare.
// Nor did v1.3.6.31's --model: runs also store `stats` and
// `thinkingChars`, and the metadata `thinking` and `memory`, all optional.
// Nor did --think: the metadata `thinking` also stores the model's
// `levels`, and `think` can be a level.
// Nor did the prompt-size guard: runs also store `promptTokens`, the
// count the pipeline's warning used (the same number as
// `stats.promptTokens`), optional like the rest.
// Nor did --follow-ups: runs made with it also store `followUps`
// ({ fired, attached }), and the metadata `retrieval` its value; the
// attached passages are ordinary shown passages.
// Nor did --provider bedrock: a Bedrock set adds optional metadata
// (provider, region, effort, maxTokens, runs, passRule, pricing, cost) and
// stores each question's runs as `runs` instead of `seeded`/`unseeded`; it
// has no Ollama fields (modelDigest, ollamaVersion, memory, tokens per
// second), and seed is "not supported", temperature "not sent". A set
// without `provider` is ollama.
const EVAL_HARNESS_VERSION = 1;

// The provider a result set was run with.
function providerOf(metadata) {
    return metadata.provider || 'ollama';
}

// A question's answered runs: an Ollama set's seeded and unseeded runs, or
// a Bedrock set's `runs` minus the ones that errored.
function runsOf(q) {
    return q.runs ? q.runs.filter((r) => !r.error) : [...q.seeded, ...q.unseeded];
}

// ---------------------------------------------------------------------------
// Judging. The per-sentence checks live in ask/checks.js (shared with the
// live route and the capture script); these are pure functions of a run and
// its gold entry, so `report` can re-judge stored runs and the tests can pin
// the rules down.
// ---------------------------------------------------------------------------

// The answer as a claim pattern sees it: no [n] markers, straight quotes,
// and the checks' normalized characters ("non‑clinical" with a
// non-breaking hyphen reads as "non-clinical").
function claimText(answer) {
    return normalizeText(answer).replace(MARKER_RE, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

// One run judged against its gold entry. A run passes when every non-exempt
// sentence has a citation, every figure is in that sentence's own cited
// sources (title, section or excerpt), it cites at least one supporting record, it cites the required
// raw session (if the entry names one), every must-claim matches and no
// must-not claim does. On an entry with acceptDecline, a decline that cites
// nothing (every sentence a decline, no sources) is excused from citing a
// supporting record, and only that. `failures` says which rules failed.
// `shownSources` is every source the prompt showed (withPromptSources
// adds it, and the label date to `sources`, to a stored run), which an
// uncited decline's figures may come from.
function judgeRun(entry, { answer, sources, shownSources = [] }) {
    const sentences = analyseAnswer(answer, sources, entry.question, shownSources);
    const cited = [...new Set(sources.map((s) => s.recordId))];
    const text = claimText(answer);
    const matches = (claim) => new RegExp(claim.pattern, 'i').test(text);

    const failures = [];
    // Per sentence: the same figure unsupported in two sentences counts twice.
    const { uncited, unsupportedFigures: unsupported, stacked } = summariseSentences(sentences);
    if (uncited.length > 0) failures.push(`${uncited.length} uncited sentence(s)`);
    if (unsupported.length > 0) failures.push(`figure(s) not in their sentence's cited sources: ${unsupported.join(', ')}`);
    const isDecline = sources.length === 0 && sentences.length > 0 && sentences.every((s) => s.exempt === 'decline');
    const declineAccepted = entry.acceptDecline === true && isDecline;
    if (!declineAccepted && !cited.some((id) => entry.supportingRecords.includes(id))) failures.push('cites no supporting record');
    if (entry.requiredRawRecord && !cited.includes(entry.requiredRawRecord)) failures.push(`doesn't cite ${entry.requiredRawRecord}`);
    for (const claim of entry.mustClaims) if (!matches(claim)) failures.push(`missing: ${claim.description}`);
    for (const claim of entry.mustNotClaims) if (matches(claim)) failures.push(`forbidden: ${claim.description}`);

    return {
        pass: failures.length === 0,
        failures,
        sentences,
        cited,
        declineAccepted,
        citesRaw: sources.some((s) => s.recordKind === 'raw'),
        uncited,
        stacks: stacked,
        unsupported,
    };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

// This checkout's commit, marked "-dirty" when the pipeline's code (ask/,
// minus the eval and static data, and projects.js) has uncommitted changes,
// so a result says which pipeline produced it.
function appCommit() {
    const git = (...args) => execFileSync('git', ['-C', path.join(__dirname, '..'), ...args], { encoding: 'utf8' }).trim();
    const dirty = git('status', '--porcelain', '--', 'ask', 'projects.js', ':(exclude)ask/eval', ':(exclude)ask/static');
    return `${git('rev-parse', 'HEAD')}${dirty ? '-dirty' : ''}`;
}

// What a stored run keeps of a source: enough to re-judge it and to read the
// excerpt it was cited for.
function storedSource(source) {
    const {
        id, recordId, recordKind, recordType, title, section, participants, excerpt, score,
    } = source;
    return { id, recordId, recordKind, recordType, title, section, participants, excerpt, score };
}

// ---------------------------------------------------------------------------
// Prompt sources. A stored run keeps its cited sources' text but not their
// label dates, and of what it was shown only the passage ids. The checks
// need both: a source's label date is evidence for a figure, and an uncited
// decline's figures may come from any shown source. So they're kept once per
// corpus commit, in ask/eval/prompt-sources/<commit>.json, rebuilt from the
// corpus at that commit: every shown passage by id, as the prompt showed it
// (title, section, roster line, text, date), and every shown record (title,
// roster line, date) for runs stored before passage ids were. `report`,
// `compare` and `run` read it; stored runs are never rewritten.
// ---------------------------------------------------------------------------

function promptSourcesFile(commit) {
    return path.join(PROMPT_SOURCES_DIR, `${commit}.json`);
}

function readPromptSources(commit) {
    const file = promptSourcesFile(commit);
    if (!fs.existsSync(file)) {
        throw new Error(`no prompt sources for corpus ${commit.slice(0, 7)} (${path.relative(process.cwd(), file)}); run \`node scripts/eval-ask.js prompt-sources\` with AGENTIC_REPO_ROOT at that commit`);
    }
    return readJson(file);
}

// A passage as the pipeline shows it: chunk `index` of the record, or its
// whole notes ("notes", RETRIEVAL.wholeRawNotes), with its roster line.
function promptPassage(record, index) {
    const chunk = index === 'notes'
        ? { heading: null, text: wholeNotesText(record), index: 'notes' }
        : chunkRecord(record)[Number(index)];
    return chunk ? { record, chunk, participants: participantsHeader(record) } : null;
}

// What the checks read of a shown passage, as ask/answer.js toSource gives it.
function passageSource({ record, chunk, participants }) {
    return {
        title: record.title,
        section: chunk.heading && chunk.heading !== record.title ? chunk.heading : null,
        participants: participants || null,
        excerpt: chunk.text,
        date: formatDate(record.date),
    };
}

function splitPassageId(id) {
    const at = id.lastIndexOf('#');
    return [id.slice(0, at), id.slice(at + 1)];
}

// A result set with each run's cited sources given their label `date`, and
// `shownSources` added, in memory. A run stored without passage ids gets
// its shown records' labels and roster lines, without their text.
function withPromptSources(results, promptSources = readPromptSources(results.metadata.corpusCommit)) {
    const recordOf = (id) => {
        const record = promptSources.records[id];
        if (!record) throw new Error(`${results.metadata.label}: ${id} isn't in the prompt sources; run \`node scripts/eval-ask.js prompt-sources\``);
        return record;
    };
    const shownSource = (x) => {
        if (!x.passage) {
            const { title, participants, date } = recordOf(x.recordId);
            return { title, section: null, participants, excerpt: '', date };
        }
        const passage = promptSources.passages[x.passage];
        if (!passage) throw new Error(`${results.metadata.label}: ${x.passage} isn't in the prompt sources; run \`node scripts/eval-ask.js prompt-sources\``);
        return passage;
    };
    const withSources = (r) => ({
        ...r,
        sources: r.sources.map((source) => ({ ...source, date: recordOf(source.recordId).date })),
        shownSources: r.shown.map(shownSource),
    });
    return {
        ...results,
        questions: results.questions.map((q) => (q.runs
            ? { ...q, runs: q.runs.map((r) => (r.error ? r : withSources(r))) }
            : { ...q, seeded: q.seeded.map(withSources), unseeded: q.unseeded.map(withSources) })),
    };
}

// Builds (or extends) the prompt sources for the corpus checkout's commit
// from every stored result at that commit, and checks the rebuild against
// what the runs stored: each cited source's title, section, roster line and
// excerpt, and, for runs that recorded their prompt size and passage ids,
// the whole prompt's length rebuilt with the run's prompt behaviors.
async function promptSources() {
    const repoRoot = process.env.AGENTIC_REPO_ROOT;
    if (!repoRoot) throw new Error('AGENTIC_REPO_ROOT is not set (backend/.env or the environment).');
    const commit = corpusCommit(repoRoot);
    const records = new Map((await loadRecords()).map((record) => [record.id, record]));
    const file = promptSourcesFile(commit);
    const out = fs.existsSync(file) ? readJson(file) : { corpusCommit: commit, records: {}, passages: {} };
    const allOff = Object.fromEntries(Object.keys(PROMPT_BEHAVIORS).map((key) => [key, false]));
    const record = (id) => {
        const found = records.get(id);
        if (!found) throw new Error(`${id} isn't in the corpus at ${commit.slice(0, 7)}`);
        return found;
    };
    const passage = (id) => {
        const [recordId, index] = splitPassageId(id);
        const found = promptPassage(record(recordId), index);
        if (!found) throw new Error(`${id} isn't a passage in the corpus at ${commit.slice(0, 7)}`);
        return found;
    };
    const problems = [];
    const prompts = {};
    for (const name of fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json')).sort()) {
        const results = readJson(path.join(RESULTS_DIR, name));
        if (results.metadata.corpusCommit !== commit) continue;
        const { label, retrieval, promptBehaviors } = results.metadata;
        prompts[label] = { rebuilt: 0, same: 0 };
        for (const q of results.questions) {
            for (const r of runsOf(q)) {
                for (const x of r.shown) {
                    const shownRecord = record(x.recordId);
                    out.records[x.recordId] = {
                        title: shownRecord.title, participants: participantsHeader(shownRecord), date: formatDate(shownRecord.date),
                    };
                    if (x.passage) out.passages[x.passage] = passageSource(passage(x.passage));
                }
                for (const source of r.sources) {
                    const rebuilt = passageSource(passage(source.id));
                    for (const key of ['title', 'section', 'excerpt', ...(source.participants === undefined ? [] : ['participants'])]) {
                        if ((source[key] ?? null) !== rebuilt[key]) problems.push(`${label} ${q.id}: cited ${source.id} ${key} differs from the corpus`);
                    }
                }
                if (retrieval && typeof r.promptChars === 'number' && r.shown.every((x) => x.passage)) {
                    const messages = buildMessages(q.question, r.shown.map((x) => ({ passage: passage(x.passage) })), promptBehaviors || allOff);
                    prompts[label].rebuilt += 1;
                    if (messages.reduce((n, m) => n + m.content.length, 0) === r.promptChars) prompts[label].same += 1;
                }
            }
        }
    }
    const sorted = (map) => Object.fromEntries(Object.keys(map).sort().map((key) => [key, map[key]]));
    writeJson(file, { corpusCommit: commit, records: sorted(out.records), passages: sorted(out.passages) });
    console.log(`Prompt sources: ${Object.keys(out.passages).length} passages, ${Object.keys(out.records).length} records (${path.relative(process.cwd(), file)})`);
    for (const [label, { rebuilt, same }] of Object.entries(prompts)) {
        console.log(`  ${label}: ${rebuilt ? `${same} of ${rebuilt} prompts rebuilt to their stored length` : 'no prompt sizes or passage ids stored'}`);
    }
    if (problems.length > 0) throw new Error(`cited sources that don't match the corpus:\n${problems.join('\n')}`);
    return prompts;
}

// A model's capabilities as Ollama lists them (/api/show), e.g.
// ["completion", "tools", "thinking"], and the `think` values it takes
// (Ollama 0.35: [false, true] for qwen3, ["low", "medium", "high"] for
// gpt-oss; null when Ollama doesn't say).
async function modelDetails(baseUrl, model) {
    const res = await fetch(`${baseUrl}/api/show`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Ollama /api/show returned ${res.status} for ${model}`);
    const data = await res.json();
    return {
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
        thinkValues: data.thinking && Array.isArray(data.thinking.values) ? data.thinking.values : null,
    };
}

// The `think` value to send: undefined (none) for a model without thinking,
// the --think level when one is given, else false. Refuses a level the
// model doesn't take, and false for a model whose levels don't include it,
// since Ollama then ignores it and the model thinks at its default level.
function thinkRequest(model, capabilities, thinkValues, level) {
    const capable = capabilities.includes('thinking');
    if (level) {
        if (!capable) throw new Error(`--think: ${model} has no thinking capability`);
        if (thinkValues && !thinkValues.includes(level)) throw new Error(`--think: ${model} takes ${thinkValues.join(', ')}, not ${level}`);
        return level;
    }
    if (!capable) return undefined;
    if (thinkValues && thinkValues.length > 0 && !thinkValues.includes(false)) {
        throw new Error(`${model} takes a thinking level (${thinkValues.join(', ')}), not think: false; pass --think LEVEL`);
    }
    return false;
}

// The chat model's memory while it's loaded, as Ollama reports it
// (/api/ps: weights, KV cache and compute buffers), or null when it isn't
// loaded or Ollama doesn't say.
async function loadedModelMemory(baseUrl, model) {
    try {
        const res = await fetch(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) return null;
        const withTag = (name) => (name.includes(':') ? name : `${name}:latest`);
        const loaded = ((await res.json()).models || []).find((m) => withTag(String(m.name)) === withTag(model));
        return loaded ? { bytes: loaded.size, vramBytes: loaded.size_vram } : null;
    } catch {
        return null;
    }
}

// An ask/ollama.js client whose chat() and chatDetailed() also keep the last
// reply's thinking and stats, for the run that asked it. Questions are asked
// one at a time.
function recordingClient(ollama) {
    const client = {
        ...ollama,
        last: null,
        chatDetailed: async (messages, options) => {
            client.last = await ollama.chatDetailed(messages, options);
            return client.last;
        },
        chat: async (messages, options) => (await client.chatDetailed(messages, options)).content,
    };
    return client;
}

// The retrieval for a run, which its metadata records: RETRIEVAL with
// --whole-raw-notes, --follow-ups and --corrections, when given, for this
// process only.
function runRetrieval({ wholeRawNotes = null, followUps = null, corrections = null }) {
    if (wholeRawNotes === null && followUps === null && corrections === null) return RETRIEVAL;
    return {
        ...RETRIEVAL,
        ...(wholeRawNotes === null ? {} : { wholeRawNotes }),
        ...(followUps === null ? {} : { followUps }),
        ...(corrections === null ? {} : { corrections }),
    };
}

// The gold entries a run asks: those in `set`, or with no --set those in
// DEFAULT_SETS, so a set added later (rationale) doesn't change what a
// plain run asks and old and new baselines stay comparable; then only the
// `only` ids, if given.
const DEFAULT_SETS = ['regression', 'scenario'];

function entriesToAsk(gold, { set = null, only = null } = {}) {
    const inSet = gold.entries.filter((e) => (set ? e.set === set : DEFAULT_SETS.includes(e.set)));
    const entries = inSet.filter((e) => !only || only.includes(e.id));
    if (only) {
        const unknown = only.filter((id) => !entries.some((e) => e.id === id));
        if (unknown.length > 0) throw new Error(`--only: no gold entry ${unknown.join(', ')}${set ? ` in the ${set} set` : ''}`);
    }
    return entries;
}

async function run({
    label, model, think: thinkLevel, seed, temperature, seededRuns, unseededRuns, set, only, wholeRawNotes, followUps, corrections, behaviors,
}) {
    if (!label) throw new Error('run needs --label NAME');
    const repoRoot = process.env.AGENTIC_REPO_ROOT;
    if (!repoRoot) throw new Error('AGENTIC_REPO_ROOT is not set (backend/.env or the environment).');
    const gold = loadGold();
    const entries = entriesToAsk(gold, { set, only });

    const ollama = createOllamaClient({
        baseUrl: process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl,
        embedModel: process.env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
        chatModel: model || process.env.OLLAMA_CHAT_MODEL || OLLAMA_DEFAULTS.chatModel,
    });
    // Refuses a model that isn't pulled, before anything else is asked.
    const info = await ollamaInfo(ollama.baseUrl, [ollama.chatModel, ollama.embedModel]);
    const { capabilities, thinkValues } = await modelDetails(ollama.baseUrl, ollama.chatModel);
    // Ollama's switch for a reasoning model's thinking. Sent only to models
    // that have it, so gemma2:9b's requests are unchanged.
    const think = thinkRequest(ollama.chatModel, capabilities, thinkValues, thinkLevel);
    const chatClient = think !== undefined
        ? createOllamaClient({ baseUrl: ollama.baseUrl, embedModel: ollama.embedModel, chatModel: ollama.chatModel, think })
        : ollama;
    const recording = recordingClient(chatClient);
    const index = createEmbeddingIndex({ embed: ollama.embed, loadRecords });
    const retrieval = runRetrieval({ wholeRawNotes, followUps, corrections });
    const promptBehaviors = withBehaviors(behaviors);
    const seeded = createAskPipeline({
        ollama: withChatOptions(recording, { seed, temperature }), index, retrieval, promptBehaviors,
    });
    const unseeded = createAskPipeline({
        ollama: withChatOptions(recording, { temperature }), index, retrieval, promptBehaviors,
    });

    const metadata = {
        harnessVersion: EVAL_HARNESS_VERSION,
        label,
        createdAt: new Date().toISOString(),
        corpusCommit: corpusCommit(repoRoot),
        appCommit: appCommit(),
        model: ollama.chatModel,
        embedModel: ollama.embedModel,
        ollamaVersion: info.version,
        modelDigest: info.digests[0],
        embedModelDigest: info.digests[1],
        capabilities,
        thinking: think === undefined
            ? { capable: false, think: null, handling: 'no think parameter sent (the model has no thinking capability); the answer is message.content only' }
            : {
                capable: true,
                think,
                levels: thinkValues,
                handling: typeof think === 'string'
                    ? `think: "${think}" (thinking level) sent with every chat request; the thinking comes back in message.thinking and is never judged; the answer is message.content only`
                    : 'think: false sent with every chat request; the answer is message.content only',
            },
        seed,
        temperature,
        chatOptions: { ...CHAT_OPTIONS, temperature },
        topK: retrieval.topK,
        retrieval,
        promptBehaviors,
        seededRuns,
        unseededRuns,
    };
    console.log(`Evaluating ${entries.length} question(s) against ${repoRoot} @ ${metadata.corpusCommit.slice(0, 7)} with ${metadata.model}`);
    console.log(`Ollama ${info.version}, seed ${seed}, temperature ${temperature}, ${seededRuns} seeded + ${unseededRuns} unseeded run(s) each`);
    console.log(`Capabilities ${capabilities.join(', ') || 'none listed'}; ${metadata.thinking.handling}`);

    // Embed the corpus before timing anything, and check the gold set names
    // real records.
    const { passages } = await index.refresh();
    const known = new Set(passages.map((p) => p.record.id));
    const missing = [...new Set(entries.flatMap((e) => e.supportingRecords))].filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`gold records not in the corpus: ${missing.join(', ')}`);

    const questions = [];
    const memory = [];
    const started = Date.now();
    for (const entry of entries) {
        // Where every in-scope record ranks, ranked by the pipeline itself
        // with no cut-off, for the first raw session's rank.
        const ranking = (await seeded.rank(entry.question, entry.project, Infinity))
            .map(({ passage, score }) => ({ recordId: passage.record.id, kind: passage.record.kind, score: Math.round(score * 1000) / 1000 }));

        const ask = async (pipeline) => {
            const askStarted = Date.now();
            recording.last = null;
            const result = await pipeline.ask(entry.question, entry.project);
            const reply = recording.last;
            return {
                secs: Math.round((Date.now() - askStarted) / 100) / 10,
                answer: result.answer,
                ...(reply ? { stats: reply.stats, thinkingChars: reply.thinking.length } : {}),
                sources: result.sources.map(storedSource),
                promptChars: result.promptChars,
                promptTokens: result.promptTokens,
                ...(result.followUps ? { followUps: result.followUps } : {}),
                shown: result.ranked.map(({ passage }, i) => ({
                    n: i + 1, recordId: passage.record.id, kind: passage.record.kind, passage: `${passage.record.id}#${passage.chunk.index}`,
                })),
            };
        };
        const q = { id: entry.id, question: entry.question, project: entry.project, ranking, seeded: [], unseeded: [] };
        for (let i = 0; i < seededRuns; i += 1) q.seeded.push(await ask(seeded));
        for (let i = 0; i < unseededRuns; i += 1) q.unseeded.push(await ask(unseeded));
        questions.push(q);
        const loaded = await loadedModelMemory(ollama.baseUrl, ollama.chatModel);
        if (loaded) memory.push(loaded);

        const verdict = judgeRun(entry, q.seeded[0]);
        const thinkingChars = [...q.seeded, ...q.unseeded].reduce((n, r) => n + (r.thinkingChars || 0), 0);
        console.log(`  ${entry.id}: ${verdict.pass ? 'PASS' : 'FAIL'}${verdict.citesRaw ? ', raw cited' : ''}, ${q.seeded.map((r) => `${r.secs}s`).join('/')} seeded${thinkingChars ? `, ${typeof think === 'string' ? '' : '⚠ '}${thinkingChars} chars of thinking text` : ''}`);
    }

    metadata.wallSecs = Math.round((Date.now() - started) / 1000);
    metadata.memory = memory.length > 0
        ? { source: 'Ollama /api/ps after each question', peakBytes: Math.max(...memory.map((m) => m.bytes)), peakVramBytes: Math.max(...memory.map((m) => m.vramBytes)) }
        : null;
    const results = { metadata, questions };
    const file = path.join(RESULTS_DIR, `${label}.json`);
    writeJson(file, results);
    // Adds this run's shown passages to the prompt sources the report needs.
    await promptSources();
    const reportFile = path.join(RESULTS_DIR, `${label}.md`);
    fs.writeFileSync(reportFile, renderReport([withPromptSources(results)], gold));
    console.log(`\nRuns: ${path.relative(process.cwd(), file)}\nReport: ${path.relative(process.cwd(), reportFile)}`);
}

// ---------------------------------------------------------------------------
// Run with --provider bedrock
// ---------------------------------------------------------------------------

// USD per 1M tokens, input / output, for each model in ask/bedrock.js
// BEDROCK_MODELS: the global profile in us-east-1 (gpt-oss-20b: the
// standard in-Region tier). Cache-read and cache-write tokens aren't priced:
// no request asks for prompt caching, and a call's cost is its input and
// output tokens only.
const BEDROCK_PRICING = {
    'global.anthropic.claude-sonnet-5-5': { inputPerM: 2, outputPerM: 10 },
    'global.anthropic.claude-opus-5-5': { inputPerM: 4, outputPerM: 20 },
    'openai.gpt-oss-20b-1:0': { inputPerM: 0.07, outputPerM: 0.30 },
};
const BEDROCK_PRICING_SOURCE = 'AWS Bedrock pricing page';
const BEDROCK_PRICING_AS_OF = '2026-10-23';

// The only AWS identity a Bedrock run may use. There is no override.
const REQUIRED_IDENTITY_SUFFIX = ':user/ux-research-demo';

const PASS_RULE_ID = 'three-then-five';

// The three-then-five pass rule, on an entry's run outcomes in the order
// they ran (true: the run passes judgeRun; an errored run is false). Three
// runs; 3-0 or 0-3 is the verdict. On 2-1 or 1-2, two more, and the
// majority of the five. `needed` is how many runs the rule needs for the
// outcomes so far; `pass` is null until it has them (a stored set re-judged
// against an edited gold file can come up short). Runs beyond `needed` are
// ignored.
function threeThenFive(outcomes) {
    const passes = (n) => outcomes.slice(0, n).filter(Boolean).length;
    if (outcomes.length < 3) return { pass: null, needed: 3, n: outcomes.length, passes: passes(3) };
    const first = passes(3);
    if (first === 0 || first === 3) return { pass: first === 3, needed: 3, n: 3, passes: first };
    if (outcomes.length < 5) return { pass: null, needed: 5, n: outcomes.length, passes: passes(5) };
    return { pass: passes(5) >= 3, needed: 5, n: 5, passes: passes(5) };
}

// A call's cost in USD from its usage. Refuses a call without token counts,
// since the cost guard can't count it.
function callCost(stats, pricing) {
    if (!stats || typeof stats.inputTokens !== 'number' || typeof stats.outputTokens !== 'number') {
        throw new Error('Bedrock returned no token usage, so the cost guard cannot count the call; stopping');
    }
    return (stats.inputTokens * pricing.inputPerM + stats.outputTokens * pricing.outputPerM) / 1e6;
}

// The pass-rule file's text and hash, or a refusal when its SHA-256 isn't
// `expected`.
function readPassRule(file, expected) {
    const bytes = fs.readFileSync(file);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== String(expected).toLowerCase()) {
        throw new Error(`refusing to run: ${file} has SHA-256 ${sha256}, not ${expected}`);
    }
    return { id: PASS_RULE_ID, sha256, text: bytes.toString('utf8') };
}

// The caller's ARN from STS GetCallerIdentity, with the SDK's default
// credential chain (AWS_PROFILE). Loaded here only, for --provider bedrock.
async function stsCallerArn(region) {
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const sts = new STSClient({ region });
    return (await sts.send(new GetCallerIdentityCommand({}))).Arn;
}

// Refuses unless the caller is the ux-research-demo IAM user. Only the part
// of the ARN after the account says who it was, so the account ID is never
// printed.
async function checkIdentity(getArn) {
    let arn;
    try {
        arn = await getArn();
    } catch (err) {
        const name = (err && err.name) || 'Error';
        throw new Error(`refusing to run: STS GetCallerIdentity failed (${name}: ${redact(err && err.message).slice(0, 200)})`);
    }
    const who = typeof arn === 'string' ? arn.slice(arn.lastIndexOf(':') + 1) : String(arn);
    if (typeof arn !== 'string' || !arn.endsWith(REQUIRED_IDENTITY_SUFFIX)) {
        throw new Error(`refusing to run: the AWS identity is ${who}, not ${REQUIRED_IDENTITY_SUFFIX.slice(1)}`);
    }
    return who;
}

// One run slot: a call, and when it fails with a BedrockError one re-run.
// If that fails too the slot is an errored run, which counts as a fail.
// `askOnce` resolves to { run, pass, cost } or { error, cost }; every
// call's cost is added to `budget.spentUsd`, and the re-run isn't started
// once that reaches `budget.limitUsd` (`stopped`).
async function runSlot(askOnce, budget) {
    const first = await askOnce();
    budget.spentUsd += first.cost;
    if (!first.error) return { run: first.run, pass: first.pass };
    if (budget.spentUsd >= budget.limitUsd) {
        return { run: { error: first.error.message, errors: [first.error.message], rerun: false, cost: first.cost }, pass: false, stopped: true };
    }
    const second = await askOnce();
    budget.spentUsd += second.cost;
    if (!second.error) return { run: { ...second.run, erroredFirst: first.error.message, cost: second.cost + first.cost }, pass: second.pass };
    return {
        run: {
            error: second.error.message, errors: [first.error.message, second.error.message], rerun: true, cost: first.cost + second.cost,
        },
        pass: false,
    };
}

// An entry's runs by the three-then-five rule. Before each slot the cost
// guard checks the running total; once it reaches the limit nothing more
// is started and `stopped` is true.
async function askByPassRule(askOnce, budget) {
    const runs = [];
    const outcomes = [];
    while (outcomes.length < threeThenFive(outcomes).needed) {
        if (budget.spentUsd >= budget.limitUsd) return { runs, outcomes, stopped: true };
        const slot = await runSlot(askOnce, budget);
        runs.push(slot.run);
        outcomes.push(slot.pass);
        if (slot.stopped) return { runs, outcomes, stopped: true };
    }
    return { runs, outcomes, stopped: false };
}

// A Bedrock set's metadata. No Ollama fields beyond the embedding model's.
function bedrockMetadata({
    label, corpusCommit: corpus, appCommit: app, client, embedModel, embedModelDigest, retrieval, promptBehaviors, passRule, pricing,
}) {
    return {
        harnessVersion: EVAL_HARNESS_VERSION,
        label,
        createdAt: new Date().toISOString(),
        corpusCommit: corpus,
        appCommit: app,
        provider: 'bedrock',
        model: client.chatModel,
        region: client.region,
        embedModel,
        embedModelDigest,
        effort: client.effort ?? 'not sent',
        maxTokens: client.maxTokens,
        temperature: 'not sent',
        seed: 'not supported',
        chatOptions: { maxTokens: client.maxTokens, effort: client.effort ?? 'not sent' },
        topK: retrieval.topK,
        retrieval,
        promptBehaviors,
        runs: { rule: PASS_RULE_ID, first: 3, onSplit: 5, rerunsAfterError: 1 },
        passRule,
        pricing: {
            ...pricing, source: BEDROCK_PRICING_SOURCE, asOf: BEDROCK_PRICING_AS_OF,
        },
    };
}

// `deps` is for the tests: `send` (the Converse call), `getCallerArn` (STS)
// and `ollamaInfo`. Without them the real ones are used.
async function runBedrock({
    label, model, set, only, wholeRawNotes, followUps, corrections, behaviors, maxCost, passRuleFile, passRuleSha256,
}, deps = {}) {
    if (!label) throw new Error('run needs --label NAME');
    const repoRoot = process.env.AGENTIC_REPO_ROOT;
    if (!repoRoot) throw new Error('AGENTIC_REPO_ROOT is not set (backend/.env or the environment).');
    if (!model && !(process.env.BEDROCK_MODEL_ID || '').trim()) throw new Error('--provider bedrock needs --model PROFILE_ID or BEDROCK_MODEL_ID');
    const config = resolveBedrockConfig({ ...process.env, ...(model ? { BEDROCK_MODEL_ID: model } : {}) });
    const pricing = BEDROCK_PRICING[config.modelId];
    if (!pricing) throw new Error(`no pricing for ${config.modelId} in BEDROCK_PRICING`);
    const passRule = readPassRule(passRuleFile, passRuleSha256);
    const gold = loadGold();
    const entries = entriesToAsk(gold, { set, only });

    // Before any call, Bedrock or Ollama.
    const who = await checkIdentity(deps.getCallerArn || (() => stsCallerArn(config.region)));

    // Embeddings only: the chat model is never asked about.
    const ollama = createOllamaClient({
        baseUrl: process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl,
        embedModel: process.env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
    });
    const info = await (deps.ollamaInfo || ollamaInfo)(ollama.baseUrl, [ollama.embedModel]);
    const client = createBedrockClient({ ...config, send: deps.send });
    const recording = recordingClient(client);
    const index = createEmbeddingIndex({ embed: ollama.embed, loadRecords });
    const retrieval = runRetrieval({ wholeRawNotes, followUps, corrections });
    const promptBehaviors = withBehaviors(behaviors);
    const pipeline = createAskPipeline({ ollama: recording, index, retrieval, promptBehaviors });

    const metadata = bedrockMetadata({
        label,
        corpusCommit: corpusCommit(repoRoot),
        appCommit: appCommit(),
        client,
        embedModel: ollama.embedModel,
        embedModelDigest: info.digests[0],
        retrieval,
        promptBehaviors,
        passRule,
        pricing,
    });
    console.log(`Evaluating ${entries.length} question(s) against ${repoRoot} @ ${metadata.corpusCommit.slice(0, 7)} with Bedrock ${metadata.model} (${metadata.region}) as ${who}`);
    console.log(`Effort ${metadata.effort}, max tokens ${metadata.maxTokens}, temperature not sent, no seed; pass rule ${PASS_RULE_ID} (${passRule.sha256.slice(0, 12)}); cost limit $${maxCost}`);

    const { passages } = await index.refresh();
    const known = new Set(passages.map((p) => p.record.id));
    const missing = [...new Set(entries.flatMap((e) => e.supportingRecords))].filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`gold records not in the corpus: ${missing.join(', ')}`);

    const budget = { limitUsd: maxCost, spentUsd: 0 };
    const questions = [];
    const started = Date.now();
    let stoppedBefore = null;
    const save = () => {
        metadata.wallSecs = Math.round((Date.now() - started) / 1000);
        metadata.cost = {
            limitUsd: maxCost,
            totalUsd: Math.round(budget.spentUsd * 1e6) / 1e6,
            stoppedAtLimit: stoppedBefore !== null,
            notAsked: entries.filter((e) => !questions.some((q) => q.id === e.id)).map((e) => e.id),
            incomplete: questions.filter((q) => q.incomplete).map((q) => q.id),
        };
        const results = { metadata, questions };
        const file = path.join(RESULTS_DIR, `${label}.json`);
        writeJson(file, results);
        return { results, file };
    };

    try {
        for (const entry of entries) {
            const ranking = (await pipeline.rank(entry.question, entry.project, Infinity))
                .map(({ passage, score }) => ({ recordId: passage.record.id, kind: passage.record.kind, score: Math.round(score * 1000) / 1000 }));

            const askOnce = async () => {
                const askStarted = Date.now();
                recording.last = null;
                let result;
                try {
                    result = await pipeline.ask(entry.question, entry.project);
                } catch (err) {
                    if (!(err instanceof BedrockError)) throw err;
                    console.log(`    ${entry.id}: ${err.message}`);
                    return { error: err, cost: err.stats ? callCost(err.stats, pricing) : 0 };
                }
                const reply = recording.last;
                const { stats } = reply;
                const cost = callCost(stats, pricing);
                const run = {
                    secs: Math.round((Date.now() - askStarted) / 100) / 10,
                    answer: result.answer,
                    usage: {
                        inputTokens: stats.inputTokens,
                        outputTokens: stats.outputTokens,
                        totalTokens: stats.totalTokens,
                        cacheReadTokens: stats.cacheReadTokens,
                        cacheWriteTokens: stats.cacheWriteTokens,
                    },
                    stopReason: stats.stopReason,
                    latencyMs: stats.latencyMs,
                    attempts: stats.attempts,
                    cost: Math.round(cost * 1e6) / 1e6,
                    ...(reply.reasoningBlocks > 0 ? { thinkingChars: reply.thinking.length } : {}),
                    sources: result.sources.map(storedSource),
                    promptChars: result.promptChars,
                    promptTokens: result.promptTokens,
                    ...(result.followUps ? { followUps: result.followUps } : {}),
                    shown: result.ranked.map(({ passage }, i) => ({
                        n: i + 1, recordId: passage.record.id, kind: passage.record.kind, passage: `${passage.record.id}#${passage.chunk.index}`,
                    })),
                };
                // Judged as `report` will re-judge it: the cited sources with
                // their label dates, and every shown passage.
                const pass = judgeRun(entry, {
                    answer: result.answer, sources: result.sources, shownSources: result.ranked.map(({ passage }) => passageSource(passage)),
                }).pass;
                return { run, pass, cost };
            };

            const { runs, outcomes, stopped } = await askByPassRule(askOnce, budget);
            if (runs.length > 0) {
                const verdict = threeThenFive(outcomes);
                questions.push({
                    id: entry.id, question: entry.question, project: entry.project, ranking, runs, ...(verdict.pass === null ? { incomplete: true } : {}),
                });
                const errored = runs.filter((r) => r.error).length;
                console.log(`  ${entry.id}: ${verdict.pass === null ? 'INCOMPLETE' : verdict.pass ? 'PASS' : 'FAIL'} ${verdict.passes}/${verdict.n} (N=${runs.length}${errored ? `, ${errored} errored` : ''}), $${budget.spentUsd.toFixed(4)} so far`);
            }
            if (stopped) {
                stoppedBefore = entry.id;
                break;
            }
        }
    } catch (err) {
        metadata.aborted = err instanceof BedrockError ? err.message : String(err.message).slice(0, 500);
        const { file } = save();
        console.error(`Stopped by an error; saved ${questions.length} question(s) to ${path.relative(process.cwd(), file)}`);
        throw err;
    }

    const { results, file } = save();
    if (stoppedBefore !== null) {
        console.log(`\nCost guard: $${budget.spentUsd.toFixed(4)} reached the --max-cost $${maxCost} limit at ${stoppedBefore}; stopped there and saved what it had. Incomplete: ${metadata.cost.incomplete.join(', ') || 'none'}; not asked: ${metadata.cost.notAsked.join(', ') || 'none'}`);
    }
    console.log(`Total cost: $${budget.spentUsd.toFixed(4)} of $${maxCost}`);
    await promptSources();
    const reportFile = path.join(RESULTS_DIR, `${label}.md`);
    fs.writeFileSync(reportFile, renderReport([withPromptSources(results)], gold));
    console.log(`\nRuns: ${path.relative(process.cwd(), file)}\nReport: ${path.relative(process.cwd(), reportFile)}`);
    return results;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

// Text safe inside a Markdown table cell.
function cell(text) {
    return String(text).replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
}

function short(recordId) {
    return recordId.replace(/^deliverable:/, 'd:');
}

// A Bedrock question that has no answered run: every run errored.
const NO_ANSWER = { secs: null, answer: '', sources: [], shown: [] };

// summarise() for a Bedrock set's question: the verdict is the
// three-then-five rule's on every run, and what the report shows of one run
// (citations, sentences, answer) is the first answered run's. Errored runs
// count as fails and are listed apart. It has no seed, so no
// seeded-identical check (null).
function summariseByPassRule(q, entry) {
    const answered = runsOf(q);
    const first = answered[0] || NO_ANSWER;
    const judged = q.runs.map((r) => (r.error ? null : judgeRun(entry, r)));
    const rule = threeThenFive(judged.map((j) => Boolean(j && j.pass)));
    const firstVerdict = judgeRun(entry, first);
    const errored = q.runs.filter((r) => r.error);
    const ruleText = `${rule.passes} of ${rule.n} runs pass${rule.pass === null ? ` (incomplete: the rule needs ${rule.needed})` : ''}`;
    const firstFailing = judged.find((j) => j && !j.pass);
    const verdict = {
        ...firstVerdict,
        pass: rule.pass === true,
        failures: rule.pass === true ? [] : [`${PASS_RULE_ID}: ${ruleText}`, ...(firstFailing ? firstFailing.failures : []), ...(errored.length ? [`${errored.length} run(s) errored`] : [])],
    };
    const rawIndex = q.ranking.findIndex((r) => r.kind === 'raw');
    return {
        q,
        verdict,
        first,
        shown: first.shown,
        firstRaw: rawIndex === -1 ? null : { rank: rawIndex + 1, of: q.ranking.length, recordId: q.ranking[rawIndex].recordId },
        seededIdentical: null,
        distinctUnseeded: new Set(answered.map((r) => r.answer)).size,
        unseededPasses: rule.passes,
        // Bedrock only: the denominators the report shows, the runs and
        // the rule's verdict, the errored runs, and the cost.
        unseededOf: rule.n,
        distinctOf: answered.length,
        ruleNote: ` (${rule.passes}/${rule.n})`,
        ruleText,
        errored: errored.map((r) => r.error),
        cost: q.runs.reduce((n, r) => n + (r.cost || 0), 0),
        coldLatency: first.secs,
        latency: median(answered.map((r) => r.secs)),
        unseededLatency: null,
        reviewFlags: reviewRun({ answer: first.answer, sources: first.sources, raw: null }, first.shown.length).flags,
    };
}

// Everything the report shows about one question in one result set.
function summarise(q, entry) {
    if (q.runs) return summariseByPassRule(q, entry);
    const first = q.seeded[0];
    const verdict = judgeRun(entry, first);
    const rawIndex = q.ranking.findIndex((r) => r.kind === 'raw');
    const signature = (r) => JSON.stringify([r.answer, r.sources.map((s) => s.id)]);
    return {
        q,
        verdict,
        first,
        shown: first.shown,
        firstRaw: rawIndex === -1 ? null : { rank: rawIndex + 1, of: q.ranking.length, recordId: q.ranking[rawIndex].recordId },
        seededIdentical: new Set(q.seeded.map(signature)).size === 1,
        distinctUnseeded: new Set(q.unseeded.map((r) => r.answer)).size,
        unseededPasses: q.unseeded.filter((r) => judgeRun(entry, r).pass).length,
        // The first seeded run is the cold one: its reruns share its prompt,
        // so Ollama answers them from its prompt cache and they run faster
        // than a live question would.
        coldLatency: first.secs,
        latency: median(q.seeded.map((r) => r.secs)),
        unseededLatency: median(q.unseeded.map((r) => r.secs)),
        reviewFlags: reviewRun({ answer: first.answer, sources: first.sources, raw: null }, first.shown.length).flags,
    };
}

// "mean / max" of a list of numbers, or "—" when there are none.
function meanMax(values, decimals = 0) {
    if (values.length === 0) return '—';
    const round = (n) => Math.round(n * 10 ** decimals) / 10 ** decimals;
    return `${round(values.reduce((a, b) => a + b, 0) / values.length)} / ${round(Math.max(...values))}`;
}

// Results stored before runs recorded their prompt size have none.
function promptSize(summaries) {
    const sizes = summaries.map((x) => x.first.promptChars);
    return sizes.every((n) => typeof n === 'number') ? meanMax(sizes) : '—';
}

// A run's generation speed: tokens written per second of generation
// (Ollama's eval_count / eval_duration), or null for runs stored without it.
function tokensPerSec(r) {
    const s = r.stats;
    return s && s.evalTokens && s.evalSecs ? s.evalTokens / s.evalSecs : null;
}

function gib(bytes) {
    return `${(bytes / 2 ** 30).toFixed(1)} GiB`;
}

function memoryText(m) {
    if (!m.memory) return '—';
    const { peakBytes, peakVramBytes } = m.memory;
    return `${gib(peakBytes)}${peakVramBytes === peakBytes ? ', all on GPU' : ` (${gib(peakVramBytes)} on GPU)`}`;
}

function firstRawText(s) {
    if (!s.firstRaw) return 'none in scope';
    return `#${s.firstRaw.rank} of ${s.firstRaw.of}${s.firstRaw.rank <= s.shown.length ? ' (shown)' : ''}`;
}

function listOrNone(items) {
    return items.length > 0 ? items.join('<br>') : '—';
}

function settingsRows(sets) {
    const m = sets.map((r) => r.metadata);
    const row = (name, f) => `| ${name} | ${m.map((x) => cell(f(x))).join(' | ')} |`;
    return [
        `| | ${m.map((x) => `\`${x.label}\``).join(' | ')} |`,
        `|---|${m.map(() => '---').join('|')}|`,
        row('Run at', (x) => x.createdAt),
        row('App commit', (x) => x.appCommit.slice(0, 12) + (x.appCommit.endsWith('-dirty') ? ' (uncommitted pipeline changes)' : '')),
        row('Corpus commit', (x) => x.corpusCommit),
        row('Chat model', (x) => `${x.model}${x.modelDigest ? ` @ ${x.modelDigest.slice(0, 12)}` : ''}`),
        row('Embedding model', (x) => `${x.embedModel}${x.embedModelDigest ? ` @ ${x.embedModelDigest.slice(0, 12)}` : ''}`),
        row('Ollama', (x) => x.ollamaVersion ?? '—'),
        row('Thinking', (x) => (x.thinking ? x.thinking.handling : '—')),
        row('Seed / temperature', (x) => `${x.seed} / ${x.temperature}`),
        row('Chat options', (x) => JSON.stringify(x.chatOptions)),
        row('Top k', (x) => x.topK),
        row('Retrieval', (x) => (x.retrieval ? JSON.stringify(x.retrieval) : '—')),
        row('Prompt behaviors on', (x) => (x.promptBehaviors ? Object.keys(x.promptBehaviors).filter((k) => x.promptBehaviors[k]).join(', ') || 'none' : '—')),
        row('Runs per question', (x) => (x.passRule ? `${x.passRule.id}: 3, then 5 on a 2-1 split` : `${x.seededRuns} seeded, ${x.unseededRuns} unseeded`)),
        ...(m.some((x) => providerOf(x) === 'bedrock') ? [
            row('Provider', (x) => (providerOf(x) === 'bedrock' ? `bedrock, ${x.region}` : providerOf(x))),
            row('Effort / max tokens', (x) => (providerOf(x) === 'bedrock' ? `${x.effort} / ${x.maxTokens}` : '—')),
            row('Pass rule', (x) => (x.passRule ? `${x.passRule.id}, file SHA-256 ${x.passRule.sha256}` : 'first seeded run')),
            row('Pricing (USD per 1M in / out)', (x) => (x.pricing ? `${x.pricing.inputPerM} / ${x.pricing.outputPerM} (${x.pricing.source}, ${x.pricing.asOf})` : '—')),
            row('Cost', (x) => (x.cost ? `$${x.cost.totalUsd.toFixed(4)} of a $${x.cost.limitUsd} limit${x.cost.stoppedAtLimit ? ', **stopped at the limit**' : ''}` : '—')),
        ] : []),
        row('Peak model memory', memoryText),
        row('Wall time', (x) => (typeof x.wallSecs === 'number' ? `${Math.round(x.wallSecs / 60)} min` : '—')),
    ];
}

// A report on one result set, or before/after on two. Judged against the
// current gold file.
function renderReport(sets, gold, { banner = null } = {}) {
    const entryFor = (q) => {
        const entry = gold.entries.find((e) => e.id === q.id);
        if (!entry) throw new Error(`${q.id} is no longer in ${path.basename(GOLD_FILE)}`);
        if (entry.question !== q.question || entry.project !== q.project) {
            throw new Error(`${q.id}: its gold question or project changed since \`${q.label}\` ran; re-run it`);
        }
        return entry;
    };
    const ids = sets[0].questions.map((q) => q.id);
    for (const set of sets.slice(1)) {
        const other = set.questions.map((q) => q.id);
        if (other.join() !== ids.join()) throw new Error('the result sets ask different questions; run both with the same --set and --only');
    }
    const summaries = sets.map((set) => set.questions.map((q) => summarise(q, entryFor({ ...q, label: set.metadata.label }))));
    const before = sets.length === 2;
    const title = before ? `\`${sets[0].metadata.label}\` → \`${sets[1].metadata.label}\`` : `\`${sets[0].metadata.label}\``;
    const join = (f) => summaries.map((s) => f(s)).join(' → ');
    const count = (list, f) => list.filter(f).length;
    const goldSetOf = (id) => gold.entries.find((e) => e.id === id).set;
    // Each gold set these results ask, as the indexes of its questions.
    const goldSets = GOLD_SETS
        .map((name) => ({ name, indexes: ids.map((_, i) => i).filter((i) => goldSetOf(ids[i]) === name) }))
        .filter((g) => g.indexes.length > 0);

    const lines = [
        `# Ask the Repo eval — ${title}`,
        '',
        'Generated by `backend/scripts/eval-ask.js` from the gold set in `backend/ask/eval/gold.json`.',
        'A manual report, not a CI check. Pass or fail is judged on the first seeded run; the unseeded',
        'runs only count distinct answers. See backend/README.md, "Evaluating answers".',
        '',
        ...settingsRows(sets),
        '',
        ...(banner ? [banner, ''] : []),
    ];
    const drift = ['ollamaVersion', 'modelDigest', 'embedModelDigest', 'model', 'embedModel']
        .filter((key) => before && sets[0].metadata[key] !== sets[1].metadata[key]);
    if (drift.length > 0) lines.push(`⚠ The two sets differ in ${drift.join(', ')}, so the same seed may not give the same answer; differences aren't all the pipeline's.`, '');

    // Each gold set gets its own totals and table: a regression pass count and
    // a scenario one mean different things, so they're never added together.
    for (const { name, indexes } of goldSets) {
        const of = (s) => indexes.map((i) => s[i]);
        const drafts = indexes.filter((i) => gold.entries.find((e) => e.id === ids[i]).status === 'draft').length;
        lines.push(`## ${name[0].toUpperCase()}${name.slice(1)} set (${indexes.length} question${indexes.length === 1 ? '' : 's'})`, '');
        if (drafts > 0) lines.push(`**${drafts} of ${indexes.length} ${name} entries are still drafts**: a person hasn't reviewed them, so treat pass/fail as provisional.`, '');
        lines.push(
            '### Totals',
            '',
            `- Gold pass: ${join((s) => `${count(of(s), (x) => x.verdict.pass)} of ${indexes.length}`)}`,
            `- Raw session cited: ${join((s) => `${count(of(s), (x) => x.verdict.citesRaw)} of ${indexes.length}`)}`,
            `- Uncited sentences: ${join((s) => of(s).reduce((n, x) => n + x.verdict.uncited.length, 0))}`,
            `- Sentences with 3+ stacked citations: ${join((s) => of(s).reduce((n, x) => n + x.verdict.stacks.length, 0))}`,
            `- Unsupported figures: ${join((s) => of(s).reduce((n, x) => n + x.verdict.unsupported.length, 0))}`,
            `- Sentences with unsupported figures: ${join((s) => of(s).reduce((n, x) => n + x.verdict.sentences.filter((y) => y.unsupported.length > 0).length, 0))}`,
            `- Questions whose seeded runs weren't identical: ${join((s) => count(of(s), (x) => x.seededIdentical === false))}`,
            `- Prompt size, mean / max (chars): ${join((s) => promptSize(of(s)))}`,
            `- Cold latency, mean / max (s): ${join((s) => meanMax(of(s).map((x) => x.coldLatency).filter((n) => typeof n === 'number'), 1))}`,
            `- Tokens per second, cold run, mean / max: ${join((s) => meanMax(of(s).map((x) => tokensPerSec(x.first)).filter((n) => n !== null), 1))}`,
            `- Runs that returned thinking text: ${join((s) => (of(s).every((x) => x.q.runs || typeof x.first.thinkingChars === 'number') ? of(s).reduce((n, x) => n + runsOf(x.q).filter((r) => r.thinkingChars > 0).length, 0) : '—'))}`,
            '',
            '### Per question',
            '',
            '| Question | Gold | Shown | First raw | Cited | Raw cited | Uncited | Stacks 3+ | Unsupported figures | Distinct unseeded | Latency, cold / median (s) |',
            '|---|---|---|---|---|---|---|---|---|---|---|',
        );
        for (const i of indexes) {
            const per = summaries.map((s) => s[i]);
            const col = (f) => per.map(f).join(' → ');
            lines.push(`| \`${ids[i]}\` | ${col((s) => `${s.verdict.pass ? 'PASS' : '**FAIL**'}${s.ruleNote || ''}`)} | ${col((s) => s.shown.length)} | ${col(firstRawText)} | ${col((s) => s.verdict.cited.length)} | ${col((s) => (s.verdict.citesRaw ? 'yes' : 'no'))} | ${col((s) => s.verdict.uncited.length)} | ${col((s) => s.verdict.stacks.length)} | ${col((s) => s.verdict.unsupported.length)} | ${col((s) => `${s.distinctUnseeded}/${s.distinctOf ?? sets[per.indexOf(s)].metadata.unseededRuns}`)} | ${col((s) => `${s.coldLatency} / ${s.latency}`)} |`);
        }
        lines.push('');
    }
    lines.push('## Questions');

    ids.forEach((id, i) => {
        const per = summaries.map((s) => s[i]);
        const entry = gold.entries.find((e) => e.id === id);
        const q = sets[0].questions[i];
        const row = (name, f) => `| ${name} | ${per.map((s) => cell(f(s))).join(' | ')} |`;
        lines.push(
            '',
            '---',
            '',
            `### \`${id}\` (${entry.set}${entry.status === 'draft' ? ', draft gold' : ''})`,
            '',
            `**${q.question}** (${q.project || 'all projects'})`,
            '',
            `Gold: supporting ${entry.supportingRecords.map((r) => `\`${short(r)}\``).join(', ')}; required raw ${entry.requiredRawRecord ? `\`${entry.requiredRawRecord}\`` : 'none'}${entry.acceptDecline ? '; a decline citing nothing is accepted (acceptDecline)' : ''}.`,
            '',
            `| | ${sets.map((set) => `\`${set.metadata.label}\``).join(' | ')} |`,
            `|---|${sets.map(() => '---').join('|')}|`,
            row('Gold', (s) => (s.verdict.pass ? 'PASS' : `FAIL: ${s.verdict.failures.join('; ')}`)),
            row('Shown', (s) => s.shown.map((x) => `[${x.n}] ${short(x.recordId)}`).join('\n')),
            row('First raw session', (s) => (s.firstRaw ? `${firstRawText(s)}: ${s.firstRaw.recordId}` : 'none in scope')),
            row('Cited', (s) => s.first.sources.map((x, n) => `[${n + 1}] ${short(x.recordId)}${x.section ? ` — ${x.section}` : ''}`).join('\n') || '—'),
            row('Raw cited', (s) => (s.verdict.citesRaw ? 'yes' : 'no')),
            `| Uncited sentences | ${per.map((s) => listOrNone(s.verdict.uncited.map(cell))).join(' | ')} |`,
            `| Stacks of 3+ | ${per.map((s) => listOrNone(s.verdict.stacks.map(cell))).join(' | ')} |`,
            row('Unsupported figures', (s) => s.verdict.unsupported.join(', ') || '—'),
            row('Exempt sentences', (s) => s.verdict.sentences.filter((x) => x.exempt).map((x) => `${x.exempt}: ${x.text}`).join('\n') || '—'),
            row('Seeded runs identical', (s) => (s.seededIdentical === null ? '— (no seed)' : s.seededIdentical ? 'yes' : 'NO')),
            row('Distinct unseeded answers', (s) => `${s.distinctUnseeded} of ${s.distinctOf ?? sets[per.indexOf(s)].metadata.unseededRuns}`),
            ...(per.some((s) => s.ruleText) ? [
                row('Pass rule runs (N)', (s) => (s.ruleText ? `${s.ruleText}; N=${s.q.runs.length}` : '—')),
                row('Errored runs', (s) => (s.errored ? s.errored.join('\n') || 'none' : '—')),
                row('Cost (USD)', (s) => (s.cost === undefined ? '—' : s.cost.toFixed(4))),
            ] : []),
            row('Prompt (chars)', (s) => s.first.promptChars ?? '—'),
            row('Latency (s)', (s) => `${s.coldLatency} cold (first seeded run), ${s.latency} seeded median, ${s.unseededLatency ?? '—'} unseeded median`),
            row('Review flags (capture script)', (s) => s.reviewFlags.join('\n') || '—'),
            row('Answer', (s) => s.first.answer),
        );
        sets.forEach((set, j) => {
            const { first } = per[j];
            if (first.sources.length === 0) return;
            lines.push('', `<details><summary>Cited excerpts, <code>${set.metadata.label}</code></summary>`, '');
            first.sources.forEach((source, n) => {
                lines.push(`**[${n + 1}] ${source.title}**${source.section ? ` — ${source.section}` : ''} · \`${source.recordId}\``, '');
                lines.push(...source.excerpt.split('\n').map((l) => `> ${l}`), '');
            });
            lines.push('</details>');
        });
    });
    return `${lines.join('\n')}\n`;
}

// Where the gold evidence stood in a question's prompt: whether its required
// raw session was shown, and how many supporting records were. Retrieval
// doesn't depend on the chat model, so this is the same for every model.
function evidenceText(entry, shown) {
    const ids = new Set(shown.map((x) => x.recordId));
    const raw = entry.requiredRawRecord
        ? `required raw ${ids.has(entry.requiredRawRecord) ? 'shown' : '**not shown**'}`
        : 'no required raw';
    return `${raw}; ${entry.supportingRecords.filter((id) => ids.has(id)).length} of ${entry.supportingRecords.length} supporting shown`;
}

// Several result sets side by side by chat model; the first set's model is
// the base. Judged against the current gold file.
function renderComparison(sets, gold, { banner = null } = {}) {
    const models = [];
    for (const set of sets) {
        let group = models.find((m) => m.model === set.metadata.model);
        if (!group) {
            group = { model: set.metadata.model, sets: [], byId: new Map() };
            models.push(group);
        }
        group.sets.push(set);
        for (const q of set.questions) {
            const entry = gold.entries.find((e) => e.id === q.id);
            if (!entry) throw new Error(`${q.id} is no longer in ${path.basename(GOLD_FILE)}`);
            if (entry.question !== q.question || entry.project !== q.project) {
                throw new Error(`${q.id}: its gold question or project changed since \`${set.metadata.label}\` ran; re-run it`);
            }
            if (group.byId.has(q.id)) throw new Error(`${q.id} is asked twice for ${group.model}`);
            group.byId.set(q.id, { ...summarise(q, entry), metadata: set.metadata });
        }
    }
    const ids = gold.entries.map((e) => e.id).filter((id) => models.some((m) => m.byId.has(id)));
    const base = models[0];
    const at = (m, id) => m.byId.get(id);
    const col = (f) => models.map((m) => f(m)).join(' | ');
    const header = `| | ${col((m) => `\`${m.model}\`${m === base ? ' (base)' : ''}`)} |`;
    const rule = `|---|${models.map(() => '---').join('|')}|`;
    const sum = (list, f) => list.reduce((n, x) => n + f(x), 0);

    const lines = [
        `# Ask the Repo eval — model comparison: ${models.map((m) => `\`${m.model}\``).join(', ')}`,
        '',
        'Generated by `backend/scripts/eval-ask.js compare` from the gold set in `backend/ask/eval/gold.json`.',
        'Every model is given the same retrieval and prompt; only the chat model differs. Pass or fail',
        'is judged on the first seeded run; unseeded passes count the unseeded runs that would also pass.',
        '',
        header,
        rule,
        `| Result sets | ${col((m) => m.sets.map((x) => `\`${x.metadata.label}\``).join(', '))} |`,
        `| Model digest | ${col((m) => (m.sets[0].metadata.modelDigest ? m.sets[0].metadata.modelDigest.slice(0, 12) : '—'))} |`,
        `| Capabilities | ${col((m) => (m.sets[0].metadata.capabilities || ['—']).join(', '))} |`,
        `| Thinking | ${col((m) => cell(m.sets[0].metadata.thinking ? m.sets[0].metadata.thinking.handling : '— (stored before --model)'))} |`,
        `| Ollama | ${col((m) => [...new Set(m.sets.map((x) => x.metadata.ollamaVersion ?? '—'))].join(', '))} |`,
        `| Corpus / seed / temperature | ${col((m) => `${m.sets[0].metadata.corpusCommit.slice(0, 7)} / ${m.sets[0].metadata.seed} / ${m.sets[0].metadata.temperature}`)} |`,
        `| Chat options | ${col((m) => cell(JSON.stringify(m.sets[0].metadata.chatOptions)))} |`,
        `| Retrieval | ${col((m) => cell(JSON.stringify(m.sets[0].metadata.retrieval || '—')))} |`,
        `| Peak model memory | ${col((m) => m.sets.map((x) => memoryText(x.metadata)).join(', '))} |`,
        `| Wall time per set | ${col((m) => m.sets.map((x) => (typeof x.metadata.wallSecs === 'number' ? `${Math.round(x.metadata.wallSecs / 60)} min` : '—')).join(', '))} |`,
        ...(sets.some((x) => providerOf(x.metadata) === 'bedrock') ? [
            `| Provider | ${col((m) => [...new Set(m.sets.map((x) => providerOf(x.metadata)))].join(', '))} |`,
            `| Pass rule | ${col((m) => [...new Set(m.sets.map((x) => (x.metadata.passRule ? x.metadata.passRule.id : 'first seeded run')))].join(', '))} |`,
            `| Cost | ${col((m) => m.sets.map((x) => (x.metadata.cost ? `$${x.metadata.cost.totalUsd.toFixed(4)}` : '—')).join(', '))} |`,
        ] : []),
        '',
        ...(banner ? [banner, ''] : []),
    ];
    const retrieval = (m) => JSON.stringify([m.sets[0].metadata.retrieval, m.sets[0].metadata.chatOptions, m.sets[0].metadata.embedModelDigest]);
    if (models.some((m) => retrieval(m) !== retrieval(base))) lines.push('⚠ The models were run with different retrieval, chat options or embedding model, so differences aren\'t all the chat model\'s.', '');
    const versions = [...new Set(models.flatMap((m) => m.sets.map((x) => x.metadata.ollamaVersion)))].filter((v) => v !== undefined);
    if (versions.length > 1) lines.push(`⚠ The sets were run on different Ollama versions (${versions.join(', ')}). A seed only reproduces an answer on the same Ollama build, so check a model re-run on both before reading small differences as the model's.`, '');

    for (const name of GOLD_SETS) {
        const inSet = ids.filter((id) => gold.entries.find((e) => e.id === id).set === name);
        if (inSet.length === 0) continue;
        const of = (m) => inSet.map((id) => at(m, id)).filter(Boolean);
        const unseededTotal = (m) => sum(of(m), (x) => x.unseededOf ?? x.metadata.unseededRuns);
        lines.push(
            `## ${name[0].toUpperCase()}${name.slice(1)} set (${inSet.length} question${inSet.length === 1 ? '' : 's'})`,
            '',
            header,
            rule,
            `| Gold pass | ${col((m) => `**${of(m).filter((x) => x.verdict.pass).length} of ${of(m).length}**`)} |`,
            `| Raw session cited | ${col((m) => `${of(m).filter((x) => x.verdict.citesRaw).length} of ${of(m).length}`)} |`,
            `| Uncited sentences | ${col((m) => sum(of(m), (x) => x.verdict.uncited.length))} |`,
            `| Sentences with 3+ stacked citations | ${col((m) => sum(of(m), (x) => x.verdict.stacks.length))} |`,
            `| Unsupported figures | ${col((m) => sum(of(m), (x) => x.verdict.unsupported.length))} |`,
            `| Unseeded runs passing | ${col((m) => `${sum(of(m), (x) => x.unseededPasses)} of ${unseededTotal(m)}`)} |`,
            `| Seeded runs not identical | ${col((m) => of(m).filter((x) => x.seededIdentical === false).length)} |`,
            `| Cold latency, mean / max (s) | ${col((m) => meanMax(of(m).map((x) => x.coldLatency).filter((n) => typeof n === 'number'), 1))} |`,
            `| Tokens per second, cold run, mean / max | ${col((m) => meanMax(of(m).map((x) => tokensPerSec(x.first)).filter((n) => n !== null), 1))} |`,
            `| Answer length, mean / max (words) | ${col((m) => meanMax(of(m).map((x) => x.first.answer.split(/\s+/).filter(Boolean).length)))} |`,
            `| Runs that returned thinking text | ${col((m) => (of(m).every((x) => x.q.runs || typeof x.first.thinkingChars === 'number') ? sum(of(m), (x) => runsOf(x.q).filter((r) => r.thinkingChars > 0).length) : '—'))} |`,
            '',
            `Per question: seeded verdict (unseeded runs passing). Gold evidence is from \`${base.model}\`'s prompt.`,
            '',
            `| Question | ${col((m) => `\`${m.model}\``)} | Gold evidence in the prompt | Same passages shown to every model |`,
            `|---|${models.map(() => '---').join('|')}|---|---|`,
        );
        for (const id of inSet) {
            const entry = gold.entries.find((e) => e.id === id);
            const shownIds = (x) => (x ? x.shown.map((y) => y.passage || y.recordId).join() : null);
            const same = models.every((m) => shownIds(at(m, id)) === shownIds(at(base, id)));
            lines.push(`| \`${id}\` | ${col((m) => {
                const x = at(m, id);
                return x ? `${x.verdict.pass ? 'PASS' : '**FAIL**'} (${x.unseededPasses}/${x.unseededOf ?? x.metadata.unseededRuns})` : '—';
            })} | ${at(base, id) ? evidenceText(entry, at(base, id).shown) : '—'} | ${same ? 'yes' : '**no**'} |`);
        }
        lines.push('');
    }

    const failing = ids.filter((id) => models.some((m) => at(m, id) && !at(m, id).verdict.pass));
    lines.push('## Entries failing on any model', '', `| Question | Gold evidence in the prompt | ${col((m) => `\`${m.model}\``)} |`, `|---|---|${models.map(() => '---').join('|')}|`);
    for (const id of failing) {
        const entry = gold.entries.find((e) => e.id === id);
        lines.push(`| \`${id}\` | ${evidenceText(entry, at(base, id).shown)} | ${col((m) => {
            const x = at(m, id);
            if (!x) return '—';
            return cell(x.verdict.pass ? 'PASS' : `FAIL: ${x.verdict.failures.join('; ')}`);
        })} |`);
    }
    lines.push('', '## Answers (first seeded run)');
    for (const id of ids) {
        const entry = gold.entries.find((e) => e.id === id);
        lines.push('', '---', '', `### \`${id}\` (${entry.set})`, '', `**${entry.question}** (${entry.project || 'all projects'})`, '');
        for (const m of models) {
            const x = at(m, id);
            if (!x) continue;
            lines.push(
                `**\`${m.model}\`: ${x.verdict.pass ? 'PASS' : `FAIL: ${x.verdict.failures.join('; ')}`}**`,
                `(cited ${x.first.sources.map((y) => short(y.recordId)).join(', ') || 'nothing'}; ${x.q.runs ? 'runs' : 'unseeded'} ${x.unseededPasses}/${x.unseededOf ?? x.metadata.unseededRuns} passing; cold ${x.coldLatency}s)`,
                '',
                ...x.first.answer.split('\n').map((l) => `> ${l}`),
                '',
            );
        }
    }
    return `${lines.join('\n')}\n`;
}

// The settings every compared result set must share. A set without
// `provider` is ollama.
const COMPARABLE_KEYS = ['harnessVersion', 'corpusCommit', 'seed', 'temperature', 'provider'];
// The ones --across-settings lets differ: a Bedrock set (no seed, no
// temperature) against a seeded Ollama one, or two seeds.
const ACROSS_SETTINGS_KEYS = ['seed', 'temperature', 'provider'];
// What the --across-settings banner also lists when it differs.
const BANNER_KEYS = [...COMPARABLE_KEYS, 'model', 'region', 'effort', 'maxTokens', 'chatOptions', 'retrieval', 'promptBehaviors', 'passRule'];

function settingValue(metadata, key) {
    if (key === 'provider') return providerOf(metadata);
    if (key === 'passRule') return metadata.passRule ? `${metadata.passRule.id} ${metadata.passRule.sha256.slice(0, 12)}` : 'first seeded run';
    const value = metadata[key];
    if (value === undefined) return '—';
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

// Refuses sets that differ in COMPARABLE_KEYS; with acrossSettings, only
// in harnessVersion or corpusCommit. Returns null when nothing differs, or
// with acrossSettings the banner listing every BANNER_KEYS setting that
// differs (also printed).
function checkComparable(labels, sets, { acrossSettings = false } = {}) {
    for (const key of COMPARABLE_KEYS) {
        const values = new Set(sets.map((x) => (key === 'provider' ? providerOf(x.metadata) : x.metadata[key])));
        if (values.size > 1 && !(acrossSettings && ACROSS_SETTINGS_KEYS.includes(key))) {
            const hint = ACROSS_SETTINGS_KEYS.includes(key) ? ', or pass --across-settings to compare them anyway' : '';
            throw new Error(`${labels.join(', ')} differ in ${key} (${[...values].join(' vs ')}); re-run so they match${hint}`);
        }
    }
    if (!acrossSettings) return null;
    const differing = BANNER_KEYS
        .map((key) => ({ key, values: sets.map((x) => settingValue(x.metadata, key)) }))
        .filter(({ values }) => new Set(values).size > 1);
    if (differing.length === 0) return null;
    const banner = [
        `⚠ **Across settings** (--across-settings): these sets differ in ${differing.map((d) => d.key).join(', ')}. Each set is judged by its own pass rule, so pass counts are not like for like.`,
        '',
        ...differing.map(({ key, values }) => `- ${key}: ${values.map((v, i) => `\`${labels[i]}\` ${v}`).join('; ')}`),
    ].join('\n');
    console.log(banner);
    return banner;
}

function readResults(label) {
    const file = path.join(RESULTS_DIR, `${label}.json`);
    if (!fs.existsSync(file)) throw new Error(`no results named ${label} (${path.relative(process.cwd(), file)})`);
    return readJson(file);
}

function compare({ label, labels, acrossSettings }) {
    if (!label) throw new Error('compare needs --label NAME');
    if (labels.length < 2) throw new Error('compare takes at least two result names');
    const sets = labels.map(readResults).map((set) => withPromptSources(set));
    const banner = checkComparable(labels, sets, { acrossSettings });
    const out = path.join(RESULTS_DIR, `${label}.md`);
    fs.writeFileSync(out, renderComparison(sets, loadGold(), { banner }));
    console.log(`Report: ${path.relative(process.cwd(), out)}`);
}

function report({ labels, acrossSettings }) {
    if (labels.length < 1 || labels.length > 2) throw new Error('report takes one result name, or two for before/after');
    const sets = labels.map(readResults).map((set) => withPromptSources(set));
    const banner = sets.length === 2 ? checkComparable(labels, sets, { acrossSettings }) : null;
    const out = path.join(RESULTS_DIR, `${labels.join('-vs-')}.md`);
    fs.writeFileSync(out, renderReport(sets, loadGold(), { banner }));
    console.log(`Report: ${path.relative(process.cwd(), out)}`);
}

// ---------------------------------------------------------------------------

// A PROMPT_BEHAVIORS key as --behaviors spells it, and back:
// declineWithEvidence <-> decline-with-evidence.
function behaviorName(key) {
    return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function behaviorKey(name) {
    return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// The prompt behaviors for a run: PROMPT_BEHAVIORS without --behaviors
// (null), otherwise exactly the names given on and the rest off.
function withBehaviors(names) {
    if (names === null) return PROMPT_BEHAVIORS;
    const on = new Set(names.map(behaviorKey));
    return Object.fromEntries(Object.keys(PROMPT_BEHAVIORS).map((key) => [key, on.has(key)]));
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {
        command, label: null, model: null, think: null, seed: 42, temperature: CHAT_OPTIONS.temperature, seededRuns: 3, unseededRuns: 3, set: null, only: null, wholeRawNotes: null, followUps: null, corrections: null, behaviors: null, labels: [],
        provider: 'ollama', maxCost: null, passRuleFile: null, passRuleSha256: null, acrossSettings: false,
    };
    // The flags given, for what --provider bedrock refuses.
    const given = new Set();
    const count = (arg, raw, min) => {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < min) throw new Error(`${arg} must be an integer ≥ ${min}`);
        return n;
    };
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        given.add(arg);
        const value = () => {
            if (i + 1 >= rest.length) throw new Error(`${arg} needs a value`);
            i += 1;
            return rest[i];
        };
        if (arg === '--label') {
            options.label = value();
            if (!/^[a-z0-9][a-z0-9._-]*$/.test(options.label)) throw new Error('--label must be lowercase letters, digits, ".", "_" or "-"');
        } else if (arg === '--model') {
            options.model = value().trim();
            if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(options.model)) throw new Error('--model must be an Ollama model name, like gemma3:27b');
        } else if (arg === '--think') {
            options.think = value().trim();
            if (!/^[a-z]+$/.test(options.think) || ['true', 'false'].includes(options.think)) throw new Error('--think must be a thinking level, like low');
        } else if (arg === '--seed') {
            options.seed = count(arg, value(), 0);
        } else if (arg === '--temperature') {
            options.temperature = Number(value());
            if (!Number.isFinite(options.temperature) || options.temperature < 0) throw new Error('--temperature must be a number ≥ 0');
        } else if (arg === '--seeded-runs') {
            options.seededRuns = count(arg, value(), 1);
        } else if (arg === '--unseeded-runs') {
            options.unseededRuns = count(arg, value(), 0);
        } else if (arg === '--set') {
            options.set = value();
            if (!GOLD_SETS.includes(options.set)) throw new Error(`--set must be one of ${GOLD_SETS.join(', ')}`);
        } else if (arg === '--only') {
            options.only = value().split(',').map((id) => id.trim()).filter(Boolean);
        } else if (arg === '--whole-raw-notes') {
            options.wholeRawNotes = count(arg, value(), 1);
        } else if (arg === '--follow-ups') {
            options.followUps = value();
            if (!['shown', 'linked'].includes(options.followUps)) throw new Error('--follow-ups must be shown or linked');
        } else if (arg === '--corrections') {
            options.corrections = value();
            if (!['shown', 'off'].includes(options.corrections)) throw new Error('--corrections must be shown or off');
        } else if (arg === '--behaviors') {
            const names = value().split(',').map((name) => name.trim()).filter(Boolean);
            const none = names.join() === 'none';
            const unknown = names.filter((name) => !Object.hasOwn(PROMPT_BEHAVIORS, behaviorKey(name)));
            if (!none && (names.length === 0 || unknown.length > 0)) {
                throw new Error(`--behaviors takes none, or names from ${Object.keys(PROMPT_BEHAVIORS).map(behaviorName).join(', ')}`);
            }
            options.behaviors = none ? [] : names;
        } else if (arg === '--provider') {
            options.provider = value();
            if (!['ollama', 'bedrock'].includes(options.provider)) throw new Error('--provider must be ollama or bedrock');
        } else if (arg === '--max-cost') {
            options.maxCost = Number(value());
            if (!Number.isFinite(options.maxCost) || options.maxCost <= 0) throw new Error('--max-cost must be a number of US dollars > 0');
        } else if (arg === '--pass-rule-file') {
            options.passRuleFile = value();
        } else if (arg === '--pass-rule-sha256') {
            options.passRuleSha256 = value().trim();
            if (!/^[0-9a-fA-F]{64}$/.test(options.passRuleSha256)) throw new Error('--pass-rule-sha256 must be 64 hex characters');
        } else if (arg === '--across-settings') {
            options.acrossSettings = true;
        } else if (!arg.startsWith('--') && (command === 'report' || command === 'compare')) {
            options.labels.push(arg);
        } else {
            throw new Error(`unknown argument ${arg}`);
        }
    }
    const bedrockOnly = ['--max-cost', '--pass-rule-file', '--pass-rule-sha256'].filter((flag) => given.has(flag));
    if (options.provider === 'bedrock') {
        const refused = ['--seed', '--temperature', '--seeded-runs', '--unseeded-runs', '--think'].filter((flag) => given.has(flag));
        if (refused.length > 0) {
            throw new Error(`--provider bedrock refuses ${refused.join(', ')}: Converse takes no seed, temperature is not sent, there is no Ollama think, and the runs follow the ${PASS_RULE_ID} pass rule`);
        }
        if (command === 'run' && options.maxCost === null) throw new Error('--provider bedrock needs --max-cost USD');
        if (command === 'run' && (!options.passRuleFile || !options.passRuleSha256)) {
            throw new Error('--provider bedrock needs --pass-rule-file PATH and --pass-rule-sha256 HASH');
        }
    } else if (bedrockOnly.length > 0) {
        throw new Error(`${bedrockOnly.join(', ')}: only with --provider bedrock`);
    }
    return options;
}

async function main() {
    // Same settings as the server (AGENTIC_REPO_ROOT, PYTHON_BIN, OLLAMA_*).
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'run') return options.provider === 'bedrock' ? runBedrock(options) : run(options);
    if (options.command === 'report') return report(options);
    if (options.command === 'compare') return compare(options);
    if (options.command === 'prompt-sources') return promptSources();
    throw new Error('usage: eval-ask.js run --label NAME [--model NAME] [--think LEVEL] [--seed N] [--temperature T] [--seeded-runs N] [--unseeded-runs N] [--set regression|scenario|rationale] [--only id,id] [--whole-raw-notes N] [--follow-ups shown|linked] [--corrections shown|off] [--behaviors none|name,name] | run --provider bedrock --label NAME [--model PROFILE_ID] --max-cost USD --pass-rule-file PATH --pass-rule-sha256 HASH [--set ...] [--only id,id] | report BEFORE [AFTER] [--across-settings] | compare --label NAME BASE OTHER... [--across-settings] | prompt-sources');
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    });
}

module.exports = {
    judgeRun, claimText, renderReport, renderComparison, parseArgs, thinkRequest, withBehaviors, withPromptSources, runRetrieval, entriesToAsk, DEFAULT_SETS, EVAL_HARNESS_VERSION,
    threeThenFive, askByPassRule, callCost, readPassRule, checkIdentity, bedrockMetadata, runBedrock, checkComparable, BEDROCK_PRICING, PASS_RULE_ID,
};
