#!/usr/bin/env node
// Captures the static demo's answers (LLM_PROVIDER=static) from the real
// local model. See backend/README.md, "Static answers for the public demo".
//
//   node scripts/capture-static-answers.js capture [--runs 3] [--only id,id]
//   node scripts/capture-static-answers.js report [--only id,id]
//   node scripts/capture-static-answers.js publish [--pick id=2 ...] [--dry-run]
//
// capture  Runs every question in ask/static/questions.json through the same
//          pipeline as POST /api/ask (ask/pipeline.js), in process, against
//          a real Ollama and the agentic-repo at AGENTIC_REPO_ROOT (both read
//          from backend/.env like the server). Keeps every run, unedited, in
//          the scratch file ask/static/review/runs.json, and writes
//          ask/static/review/report.md for a person to check. --only
//          recaptures just those ids and keeps every other run.
// report   Re-runs the checks on runs.json and rewrites report.md. --only
//          limits the report to those ids.
// publish  Writes ask/static/answers.json: one run per question in
//          questions.json, copied verbatim. By default the first run with no
//          flags that meets the citation bar; --pick id=N chooses run N.
//          Drop a question from questions.json to leave it out. --dry-run
//          checks and lists the selection without writing anything.
//
// Nothing here edits an answer. The review directory is git-ignored.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { createOllamaClient, OLLAMA_DEFAULTS } = require('../ask/ollama');
const { loadRecords } = require('../ask/corpus');
const { createEmbeddingIndex } = require('../ask/retrieval');
const { createAskPipeline } = require('../ask/pipeline');
const {
    STATIC_DIR, QUESTIONS_FILE, ANSWERS_FILE, CAPTURE_SCRIPT_VERSION,
    citationMarkers, validateQuestionList, validateStaticAnswers,
} = require('../ask/staticAnswers');

const REVIEW_DIR = path.join(STATIC_DIR, 'review');
const RUNS_FILE = path.join(REVIEW_DIR, 'runs.json');
const REPORT_FILE = path.join(REVIEW_DIR, 'report.md');

// ---------------------------------------------------------------------------
// Review checks. None of these can say a citation is *correct*; they point a
// person at the ones most likely to be wrong.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set((
    'about above after again against also among because been before being below between both but '
    + 'could did does doing down during each even every from further have having here into itself '
    + 'just more most much must only other over same should some such than that their them then '
    + 'there these they this those through under until very were what when where which while who '
    + 'whom why will with within without would your yours often many said says like felt '
    + 'participant participants session sessions source sources'
).split(' '));

// Lowercased content words, crudely stemmed so "physicians"/"physician" and
// "flagged"/"flag" meet, plus numbers ("64", "1.2"), which are the strongest
// sign a claim came from a passage.
function contentWords(text) {
    const lower = String(text).toLowerCase().replace(/[’']s\b/g, '');
    const words = (lower.match(/[a-z]{4,}/g) || [])
        .filter((word) => !STOPWORDS.has(word))
        .map((word) => word.replace(/(ing|ed|es|s)$/, ''));
    const numbers = lower.match(/\d+(?:\.\d+)?/g) || [];
    return new Set([...words, ...numbers]);
}

// The sentence (or list item) each [n] marker belongs to. The model writes
// markers both before and after the full stop ("…sessions [1]." and
// "…sessions. [1]"), so a split only happens after punctuation and any
// markers that follow it.
function citedSentences(answer) {
    const out = [];
    for (const piece of answer.split(/(?<=[.!?](?:\s*\[\d+\])*)\s+(?!\[)|\n+/)) {
        for (const n of citationMarkers(piece)) out.push({ n, sentence: piece.replace(/\[\d+\]/g, '').trim() });
    }
    return out;
}

const NUMBER_WORDS = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
const NUMBER_WORD_RE = new RegExp(`\\b(${NUMBER_WORDS.slice(1).join('|')})\\b`, 'g');
const NUMBER_RE = /\d+(?:\.\d+)?/g;
const PAIR_RE = /(\d+(?:\.\d+)?)\s*(?:of|out of|\/)\s*(\d+(?:\.\d+)?)/g;

// Text with "one" through "twenty" written as digits, so "four" and "4"
// compare equal. Percent signs need no handling: "52%" yields "52".
function digitsForWords(text) {
    return String(text).toLowerCase().replace(NUMBER_WORD_RE, (word) => String(NUMBER_WORDS.indexOf(word)));
}

function numbersIn(text) {
    return digitsForWords(text).match(NUMBER_RE) || [];
}

// "N of M" / "N out of M" / "N/M" counts, as "N of M" strings.
function countPairsIn(text) {
    return [...digitsForWords(text).matchAll(PAIR_RE)].map((m) => `${m[1]} of ${m[2]}`);
}

// Numbers in the answer that no cited excerpt contains, and "N of M" counts
// no cited excerpt states. The second catches a right number in the wrong
// count, like "4 of 4" cited to an excerpt that says "4 of 5".
function unsupportedNumbers(answer, sources) {
    const text = answer.replace(/\[\d+\]/g, '');
    const excerpts = sources.map((source) => source.excerpt).join('\n');
    const known = new Set(numbersIn(excerpts));
    const knownPairs = new Set(countPairsIn(excerpts));
    return {
        numbers: [...new Set(numbersIn(text))].filter((n) => !known.has(n)),
        pairs: [...new Set(countPairsIn(text))].filter((pair) => !knownPairs.has(pair)),
    };
}

// Flags one run. `shownCount` is how many sources the model was shown, for
// markers in its raw reply that pointed at none of them (renumberCitations
// drops those from the answer, so they only show up in `raw`).
function reviewRun({ answer, sources, raw }, shownCount) {
    const flags = [];
    if (sources.length === 0) flags.push('no citations');

    const beyond = citationMarkers(answer).filter((n) => n < 1 || n > sources.length);
    if (beyond.length > 0) flags.push(`answer has ${beyond.map((n) => `[${n}]`).join(' ')} beyond its ${sources.length} sources`);

    const dangling = [...String(raw || '').matchAll(/\[(\s*\d+\s*(?:[,–-]\s*\d+\s*)*)\]/g)]
        .flatMap((match) => match[1].split(/[,–-]/).map((part) => Number(part.trim())))
        .filter((n) => n < 1 || n > shownCount);
    if (dangling.length > 0) {
        flags.push(`model cited ${[...new Set(dangling)].map((n) => `[${n}]`).join(' ')}, which point at nothing (shown ${shownCount}); dropped from the answer`);
    }

    const weak = [];
    for (const { n, sentence } of citedSentences(answer)) {
        const source = sources[n - 1];
        if (!source) continue;
        const claim = contentWords(sentence);
        const evidence = contentWords(`${source.title} ${source.section || ''} ${source.excerpt}`);
        const shared = [...claim].filter((word) => evidence.has(word));
        if (claim.size > 0 && (shared.length < 2 || shared.length / claim.size < 0.2)) {
            weak.push({ n, sentence, shared });
        }
    }
    for (const { n, sentence, shared } of weak) {
        flags.push(`[${n}] may be unrelated to "${sentence.slice(0, 90)}${sentence.length > 90 ? '…' : ''}" (shares: ${shared.join(', ') || 'nothing'})`);
    }

    if (sources.length > 0) {
        const { numbers, pairs } = unsupportedNumbers(answer, sources);
        if (numbers.length > 0) flags.push(`number(s) in no cited excerpt: ${numbers.join(', ')}`);
        if (pairs.length > 0) flags.push(`count(s) no cited excerpt states: ${pairs.map((p) => `"${p}"`).join(', ')}`);
    }

    const records = new Set(sources.map((s) => s.recordId));
    const hasRaw = sources.some((s) => s.recordKind === 'raw');
    return {
        flags,
        citedRecords: records.size,
        citesRawSession: hasRaw,
        meetsBar: records.size >= 2 && hasRaw,
    };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function quote(text) {
    return String(text).split('\n').map((line) => `> ${line}`).join('\n');
}

function renderReport(runsFile) {
    const { metadata, questions } = runsFile;
    const lines = [
        '# Static answers — review report',
        '',
        `Captured ${metadata.capturedAt} with ${metadata.model} (embeddings: ${metadata.embedModel}),`,
        `corpus ${metadata.corpusCommit}, script v${metadata.scriptVersion}.`,
        '',
        'The bar: every run cites at least 2 records, including a raw session, and each',
        'cited record really supports the claim. Only the first half is automatic; read',
        'each [n] against its excerpt below. Flags mark what to check first.',
        '',
        '| Question | Project | Runs meeting the count bar | Runs with flags |',
        '|---|---|---|---|',
    ];
    for (const q of questions) {
        const bar = q.runs.filter((r) => r.review.meetsBar).length;
        const flagged = q.runs.filter((r) => r.review.flags.length > 0).length;
        lines.push(`| \`${q.id}\` | ${q.project || 'all'} | ${bar}/${q.runs.length} | ${flagged}/${q.runs.length} |`);
    }

    for (const q of questions) {
        lines.push('', '---', '', `## \`${q.id}\``, '', `**${q.question}** (${q.project || 'all projects'})`);
        for (const run of q.runs) {
            const { review } = run;
            lines.push(
                '',
                `### Run ${run.run} — ${review.citedRecords} record(s)${review.citesRawSession ? ', raw session cited' : ', NO raw session'}${review.meetsBar ? '' : ' — BELOW BAR'}`,
                '',
            );
            if (review.flags.length > 0) {
                lines.push(...review.flags.map((flag) => `- ⚑ ${flag}`), '');
            }
            lines.push(quote(run.answer), '');
            run.sources.forEach((source, i) => {
                const where = [source.recordKind, source.recordType, source.date].filter(Boolean).join(', ');
                lines.push(
                    `**[${i + 1}] ${source.title}**${source.section ? ` — ${source.section}` : ''} (${where}) · \`${source.recordId}\``,
                    '',
                    quote(source.excerpt),
                    '',
                );
            });
            lines.push(`<sub>Shown to the model: ${run.shown.map((s) => `[${s.n}] ${s.recordId}`).join(' · ')}</sub>`);
        }
    }
    return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readQuestions() {
    const list = readJson(QUESTIONS_FILE);
    const problems = validateQuestionList(list);
    if (problems.length > 0) throw new Error(`${QUESTIONS_FILE} is invalid:\n  ${problems.join('\n  ')}`);
    return list;
}

function corpusCommit(repoRoot) {
    const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
    if (git('status', '--porcelain')) {
        throw new Error(`${repoRoot} has uncommitted changes; capture against a clean commit so corpusCommit means something.`);
    }
    return git('rev-parse', 'HEAD');
}

async function capture({ runs, only }) {
    const repoRoot = process.env.AGENTIC_REPO_ROOT;
    if (!repoRoot) throw new Error('AGENTIC_REPO_ROOT is not set (backend/.env or the environment).');
    const questions = readQuestions().filter((q) => !only || only.includes(q.id));
    if (only) {
        const unknown = only.filter((id) => !questions.some((q) => q.id === id));
        if (unknown.length > 0) throw new Error(`--only: no such question ${unknown.join(', ')}`);
    }

    const ollama = createOllamaClient({
        baseUrl: process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl,
        embedModel: process.env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
        chatModel: process.env.OLLAMA_CHAT_MODEL || OLLAMA_DEFAULTS.chatModel,
    });
    const pipeline = createAskPipeline({ ollama, index: createEmbeddingIndex({ embed: ollama.embed, loadRecords }) });

    const metadata = {
        model: ollama.chatModel,
        embedModel: ollama.embedModel,
        capturedAt: new Date().toISOString(),
        corpusCommit: corpusCommit(repoRoot),
        scriptVersion: CAPTURE_SCRIPT_VERSION,
    };
    console.log(`Capturing ${questions.length} question(s) × ${runs} run(s) against ${repoRoot} @ ${metadata.corpusCommit.slice(0, 7)} with ${metadata.model}`);

    const captured = [];
    for (const q of questions) {
        const entry = { id: q.id, question: q.question, project: q.project, runs: [] };
        for (let run = 1; run <= runs; run += 1) {
            const started = Date.now();
            const result = await pipeline.ask(q.question, q.project);
            const shown = result.ranked.map(({ passage }, i) => ({ n: i + 1, recordId: passage.record.id, title: passage.record.title }));
            const review = reviewRun(result, shown.length);
            entry.runs.push({ run, answer: result.answer, sources: result.sources, model: result.model, raw: result.raw, shown, review });
            console.log(`  ${q.id} run ${run}: ${review.citedRecords} record(s)${review.citesRawSession ? ' incl. raw' : ''}, ${review.flags.length} flag(s), ${((Date.now() - started) / 1000).toFixed(1)}s`);
        }
        captured.push(entry);
    }

    // --only merges into the previous capture, which must share its corpus
    // commit and models so the published file's metadata is true of every
    // answer in it.
    let questionsOut = captured;
    if (only && fs.existsSync(RUNS_FILE)) {
        const previous = readJson(RUNS_FILE);
        for (const key of ['model', 'embedModel', 'corpusCommit']) {
            if (previous.metadata[key] !== metadata[key]) {
                throw new Error(`--only: the previous capture's ${key} (${previous.metadata[key]}) differs from this one's (${metadata[key]}); recapture everything instead.`);
            }
        }
        // In questions.json order, then any earlier runs of questions since
        // dropped from it, so the scratch file never loses a run.
        const current = readQuestions()
            .map((q) => captured.find((c) => c.id === q.id) || previous.questions.find((p) => p.id === q.id))
            .filter(Boolean);
        questionsOut = [...current, ...previous.questions.filter((p) => !current.some((c) => c.id === p.id))];
        metadata.capturedAt = previous.metadata.capturedAt;
    }

    const runsFile = { metadata, questions: questionsOut };
    writeJson(RUNS_FILE, runsFile);
    fs.writeFileSync(REPORT_FILE, renderReport(runsFile));
    console.log(`\nAll runs: ${path.relative(process.cwd(), RUNS_FILE)}\nReview report: ${path.relative(process.cwd(), REPORT_FILE)}`);
}

// Re-runs the review checks on the stored runs, so a change to the checks
// applies without recapturing.
function report({ only }) {
    const runsFile = readJson(RUNS_FILE);
    for (const q of runsFile.questions) {
        for (const run of q.runs) run.review = reviewRun(run, run.shown.length);
    }
    writeJson(RUNS_FILE, runsFile);
    const shown = only ? runsFile.questions.filter((q) => only.includes(q.id)) : runsFile.questions;
    fs.writeFileSync(REPORT_FILE, renderReport({ ...runsFile, questions: shown }));
    console.log(`Review report: ${path.relative(process.cwd(), REPORT_FILE)}`);
}

function publish({ picks, dryRun }) {
    const { metadata, questions: captured } = readJson(RUNS_FILE);
    const problems = [];
    const entries = [];
    for (const q of readQuestions()) {
        const capturedQ = captured.find((c) => c.id === q.id);
        if (!capturedQ) {
            problems.push(`${q.id}: never captured`);
            continue;
        }
        if (capturedQ.question !== q.question || capturedQ.project !== q.project) {
            problems.push(`${q.id}: its question or project changed since it was captured; recapture it`);
            continue;
        }
        const pick = picks.get(q.id);
        const run = pick
            ? capturedQ.runs.find((r) => r.run === pick)
            : capturedQ.runs.find((r) => r.review.meetsBar && r.review.flags.length === 0);
        if (!run) {
            problems.push(pick ? `${q.id}: there is no run ${pick}` : `${q.id}: no run meets the bar without flags; choose one with --pick ${q.id}=N or drop it`);
            continue;
        }
        entries.push({ id: q.id, question: q.question, project: q.project, answer: run.answer, sources: run.sources, run: run.run });
    }
    for (const id of picks.keys()) {
        if (!entries.some((e) => e.id === id) && !problems.some((p) => p.startsWith(`${id}:`))) problems.push(`--pick ${id}: not in questions.json`);
    }

    const data = {
        metadata: {
            model: metadata.model,
            embedModel: metadata.embedModel,
            capturedAt: metadata.capturedAt,
            corpusCommit: metadata.corpusCommit,
            scriptVersion: metadata.scriptVersion,
        },
        questions: entries,
    };
    problems.push(...validateStaticAnswers(data));
    if (problems.length > 0) throw new Error(`Not publishing:\n  ${problems.join('\n  ')}`);

    if (!dryRun) writeJson(ANSWERS_FILE, data);
    console.log(`${dryRun ? 'Would publish' : 'Published'} ${entries.length} answer(s) to ${path.relative(process.cwd(), ANSWERS_FILE)}:`);
    for (const e of entries) console.log(`  ${e.id}: run ${e.run}`);
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = { command, runs: 3, only: null, picks: new Map(), dryRun: false };
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        const value = () => {
            if (i + 1 >= rest.length) throw new Error(`${arg} needs a value`);
            i += 1;
            return rest[i];
        };
        if (arg === '--runs') {
            options.runs = Number(value());
            if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs must be a positive integer');
        } else if (arg === '--only') {
            options.only = value().split(',').map((id) => id.trim()).filter(Boolean);
        } else if (arg === '--pick') {
            const match = /^([a-z0-9-]+)=(\d+)$/.exec(value());
            if (!match) throw new Error('--pick takes id=N');
            options.picks.set(match[1], Number(match[2]));
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else {
            throw new Error(`unknown argument ${arg}`);
        }
    }
    return options;
}

async function main() {
    // Same settings as the server (AGENTIC_REPO_ROOT, PYTHON_BIN, OLLAMA_*).
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    const options = parseArgs(process.argv.slice(2));
    if (options.command === 'capture') return capture(options);
    if (options.command === 'report') return report(options);
    if (options.command === 'publish') return publish(options);
    throw new Error('usage: capture-static-answers.js capture [--runs N] [--only id,id] | report [--only id,id] | publish [--pick id=N ...] [--dry-run]');
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    });
}

module.exports = { reviewRun, citedSentences, contentWords, unsupportedNumbers, renderReport };
