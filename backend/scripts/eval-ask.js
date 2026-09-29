#!/usr/bin/env node
// Ask the Repo evaluation harness: runs the gold set (ask/eval/gold.json)
// through the real pipeline and writes a pass/fail report, so a change to
// chunking, retrieval or prompting can be measured before and after. A
// manual report, not a CI check: it needs a real Ollama and the agentic-repo
// clone. See backend/README.md, "Evaluating answers".
//
//   node scripts/eval-ask.js run --label NAME [--seed 42] [--temperature 0.2]
//                                [--seeded-runs 3] [--unseeded-runs 3]
//                                [--set regression|scenario] [--only id,id]
//   node scripts/eval-ask.js report BEFORE [AFTER]
//
// run     Asks every gold question --seeded-runs times with the fixed seed and
//         --unseeded-runs times without one, both at --temperature, through
//         ask/pipeline.js in process (the chat options are overridden for
//         this process only). Writes the runs to ask/eval/results/NAME.json
//         and the report to ask/eval/results/NAME.md. Pass or fail is decided
//         on the first seeded run; the unseeded runs only count distinct
//         answers. --set asks only one gold set's questions, --only only the
//         ids given (within --set, if both are given).
// report  Re-judges stored runs against the current gold file (so editing
//         the gold set needs no re-run) and rewrites the report. With two
//         names it writes a before/after report to ask/eval/results/
//         BEFORE-vs-AFTER.md, and refuses unless both share the harness
//         version, corpus commit, seed and temperature.
//
// Both report each gold set (regression, scenario) in its own section with
// its own pass counts, taking an entry's set from the current gold file.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { createOllamaClient, OLLAMA_DEFAULTS } = require('../ask/ollama');
const { loadRecords } = require('../ask/corpus');
const { createEmbeddingIndex, rankPassages } = require('../ask/retrieval');
const { createAskPipeline, CHAT_OPTIONS, TOP_K } = require('../ask/pipeline');
const { loadGold, GOLD_FILE, GOLD_SETS } = require('../ask/eval/gold');
const {
    reviewRun, numbersIn, countPairsIn, corpusCommit, ollamaInfo, withChatOptions,
} = require('./capture-static-answers');

const RESULTS_DIR = path.join(__dirname, '..', 'ask', 'eval', 'results');
// Bump when what `run` stores or how it runs the pipeline changes; `report`
// only compares results from the same version. An entry's gold set isn't
// stored with its runs (the report reads it from the gold file), so adding
// sets didn't change it.
const EVAL_HARNESS_VERSION = 1;

// ---------------------------------------------------------------------------
// Checks. Pure functions of an answer and its sources, so `report` can
// re-judge stored runs and the tests can pin the rules down.
// ---------------------------------------------------------------------------

const MARKER_RE = /\[(\d+)\]/g;
const LIST_ITEM_RE = /^\s*(?:[-•*]|\d+[.)])\s+/;
// A sentence saying the sources don't cover something. Not a claim, so it
// needs no citation (a figure in it still needs one).
const DECLINE_RE = /\b(sources?|records?|notes?|data|research|documents?|repository|repo)\b[^.]{0,60}\b(do not|don't|does not|doesn't|did not|didn't|not|no|never)\b[^.]{0,40}\b(say|state|mention|describe|include|contain|specify|provide|give|report|answer|cover|address|discuss|information|detail)/i;

function markersIn(text) {
    return [...String(text).matchAll(MARKER_RE)].map((m) => Number(m[1]));
}

function withoutMarkers(text) {
    return String(text).replace(MARKER_RE, '').replace(/[ \t]+([.,;:!?])/g, '$1').trim();
}

// The answer as sentences and list items, each with its own [n] markers.
// Lines are split into sentences the way the capture script's
// citedSentences does, except that a list item's leading "1." or "-" is
// kept out of it. A line of nothing but markers belongs to what precedes it:
// a list's trailing "[1][2]" cites the whole list (a group citation), and
// anywhere else it joins the sentence before it.
function answerSentences(answer) {
    const out = [];
    let listStart = null; // index in `out` where the current run of list items began
    for (const line of String(answer).split(/\n+/)) {
        if (!line.trim()) continue;
        const listItem = LIST_ITEM_RE.test(line);
        const body = line.replace(LIST_ITEM_RE, '');
        const pieces = body.split(/(?<=[.!?](?:\s*\[\d+\])*)\s+(?!\[)/).map((p) => p.trim()).filter(Boolean);
        for (const piece of pieces) {
            const text = withoutMarkers(piece);
            const markers = markersIn(piece);
            if (!text) {
                const previous = out[out.length - 1];
                if (!previous) continue;
                if (previous.listItem && listStart !== null) {
                    for (const item of out.slice(listStart)) item.groupMarkers = [...new Set([...item.groupMarkers, ...markers])];
                } else {
                    previous.markers = [...previous.markers, ...markers];
                }
                continue;
            }
            if (listItem && listStart === null) listStart = out.length;
            if (!listItem) listStart = null;
            out.push({ text, markers, listItem, groupMarkers: [] });
        }
    }
    // A list intro ("The steps are: [1]") also cites the list below it.
    out.forEach((sentence, i) => {
        if (sentence.listItem || !sentence.text.endsWith(':') || sentence.markers.length === 0) return;
        for (let j = i + 1; j < out.length && out[j].listItem; j += 1) {
            out[j].groupMarkers = [...new Set([...out[j].groupMarkers, ...sentence.markers])];
        }
    });
    return out;
}

// Every sentence of an answer, checked against the sources it cites:
//   exempt       why it needs no citation of its own: 'decline', 'list intro'
//                (ends with ":"), or 'group-cited list item'; null otherwise
//   uncited      not exempt and cites nothing
//   stack        distinct sources it cites (3 or more is a stack)
//   unsupported  figures and "N of M" counts that none of *its own* cited
//                excerpts contain (a group-cited item uses the group's). A
//                decline may repeat the question's own figures ("the sources
//                don't describe the step 3 wireframe").
function analyseAnswer(answer, sources, question = '') {
    return answerSentences(answer).map((sentence) => {
        const own = [...new Set(sentence.markers)];
        const cites = own.length > 0 ? own : sentence.groupMarkers;
        let exempt = null;
        if (own.length === 0) {
            if (DECLINE_RE.test(sentence.text)) exempt = 'decline';
            else if (!sentence.listItem && sentence.text.endsWith(':')) exempt = 'list intro';
            else if (sentence.listItem && sentence.groupMarkers.length > 0) exempt = 'group-cited list item';
        }
        const excerpts = cites.map((n) => (sources[n - 1] ? sources[n - 1].excerpt : '')).join('\n');
        const evidence = exempt === 'decline' ? `${excerpts}\n${question}` : excerpts;
        const knownNumbers = new Set(numbersIn(evidence));
        const knownPairs = new Set(countPairsIn(evidence));
        return {
            text: sentence.text,
            listItem: sentence.listItem,
            cites,
            exempt,
            uncited: exempt === null && own.length === 0,
            stack: own.length,
            unsupported: [
                ...[...new Set(numbersIn(sentence.text))].filter((n) => !knownNumbers.has(n)),
                ...[...new Set(countPairsIn(sentence.text))].filter((pair) => !knownPairs.has(pair)).map((pair) => `"${pair}"`),
            ],
        };
    });
}

// The answer as a claim pattern sees it: no [n] markers, straight quotes.
function claimText(answer) {
    return String(answer).replace(MARKER_RE, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

// One run judged against its gold entry. A run passes when every non-exempt
// sentence has a citation, every figure is in that sentence's own cited
// excerpts, it cites at least one supporting record, it cites the required
// raw session (if the entry names one), every must-claim matches and no
// must-not claim does. On an entry with acceptDecline, a decline that cites
// nothing (every sentence a decline, no sources) is excused from citing a
// supporting record, and only that. `failures` says which rules failed.
function judgeRun(entry, { answer, sources }) {
    const sentences = analyseAnswer(answer, sources, entry.question);
    const cited = [...new Set(sources.map((s) => s.recordId))];
    const text = claimText(answer);
    const matches = (claim) => new RegExp(claim.pattern, 'i').test(text);

    const failures = [];
    const uncited = sentences.filter((s) => s.uncited);
    if (uncited.length > 0) failures.push(`${uncited.length} uncited sentence(s)`);
    // Per sentence: the same figure unsupported in two sentences counts twice.
    const unsupported = sentences.flatMap((s) => s.unsupported);
    if (unsupported.length > 0) failures.push(`figure(s) not in their sentence's cited excerpts: ${unsupported.join(', ')}`);
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
        uncited: uncited.map((s) => s.text),
        stacks: sentences.filter((s) => s.stack >= 3).map((s) => s.text),
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
    const { id, recordId, recordKind, recordType, title, section, excerpt, score } = source;
    return { id, recordId, recordKind, recordType, title, section, excerpt, score };
}

async function run({ label, seed, temperature, seededRuns, unseededRuns, set, only }) {
    if (!label) throw new Error('run needs --label NAME');
    const repoRoot = process.env.AGENTIC_REPO_ROOT;
    if (!repoRoot) throw new Error('AGENTIC_REPO_ROOT is not set (backend/.env or the environment).');
    const gold = loadGold();
    const inSet = gold.entries.filter((e) => !set || e.set === set);
    const entries = inSet.filter((e) => !only || only.includes(e.id));
    if (only) {
        const unknown = only.filter((id) => !entries.some((e) => e.id === id));
        if (unknown.length > 0) throw new Error(`--only: no gold entry ${unknown.join(', ')}${set ? ` in the ${set} set` : ''}`);
    }

    const ollama = createOllamaClient({
        baseUrl: process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl,
        embedModel: process.env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
        chatModel: process.env.OLLAMA_CHAT_MODEL || OLLAMA_DEFAULTS.chatModel,
    });
    const index = createEmbeddingIndex({ embed: ollama.embed, loadRecords });
    const seeded = createAskPipeline({ ollama: withChatOptions(ollama, { seed, temperature }), index });
    const unseeded = createAskPipeline({ ollama: withChatOptions(ollama, { temperature }), index });
    const info = await ollamaInfo(ollama.baseUrl, [ollama.chatModel, ollama.embedModel]);

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
        seed,
        temperature,
        chatOptions: { ...CHAT_OPTIONS, temperature },
        topK: TOP_K,
        seededRuns,
        unseededRuns,
    };
    console.log(`Evaluating ${entries.length} question(s) against ${repoRoot} @ ${metadata.corpusCommit.slice(0, 7)} with ${metadata.model}`);
    console.log(`Ollama ${info.version}, seed ${seed}, temperature ${temperature}, ${seededRuns} seeded + ${unseededRuns} unseeded run(s) each`);

    // Embed the corpus before timing anything, and check the gold set names
    // real records.
    const { passages } = await index.refresh();
    const known = new Set(passages.map((p) => p.record.id));
    const missing = [...new Set(entries.flatMap((e) => e.supportingRecords))].filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`gold records not in the corpus: ${missing.join(', ')}`);

    const questions = [];
    for (const entry of entries) {
        // Where every in-scope record ranks, as the pipeline ranks them (best
        // passage per record), for the first raw session's rank.
        const inScope = entry.project
            ? passages.filter(({ record }) => Array.isArray(record.tags) && record.tags.includes(entry.project))
            : passages;
        const ranking = rankPassages(await index.embedQuery(entry.question), inScope, Infinity)
            .map(({ passage, score }) => ({ recordId: passage.record.id, kind: passage.record.kind, score: Math.round(score * 1000) / 1000 }));

        const ask = async (pipeline) => {
            const started = Date.now();
            const result = await pipeline.ask(entry.question, entry.project);
            return {
                secs: Math.round((Date.now() - started) / 100) / 10,
                answer: result.answer,
                sources: result.sources.map(storedSource),
                shown: result.ranked.map(({ passage }, i) => ({ n: i + 1, recordId: passage.record.id, kind: passage.record.kind })),
            };
        };
        const q = { id: entry.id, question: entry.question, project: entry.project, ranking, seeded: [], unseeded: [] };
        for (let i = 0; i < seededRuns; i += 1) q.seeded.push(await ask(seeded));
        for (let i = 0; i < unseededRuns; i += 1) q.unseeded.push(await ask(unseeded));
        questions.push(q);

        const verdict = judgeRun(entry, q.seeded[0]);
        console.log(`  ${entry.id}: ${verdict.pass ? 'PASS' : 'FAIL'}${verdict.citesRaw ? ', raw cited' : ''}, ${q.seeded.map((r) => `${r.secs}s`).join('/')} seeded`);
    }

    const results = { metadata, questions };
    const file = path.join(RESULTS_DIR, `${label}.json`);
    writeJson(file, results);
    const reportFile = path.join(RESULTS_DIR, `${label}.md`);
    fs.writeFileSync(reportFile, renderReport([results], gold));
    console.log(`\nRuns: ${path.relative(process.cwd(), file)}\nReport: ${path.relative(process.cwd(), reportFile)}`);
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

// Everything the report shows about one question in one result set.
function summarise(q, entry) {
    const first = q.seeded[0];
    const verdict = judgeRun(entry, first);
    const rawIndex = q.ranking.findIndex((r) => r.kind === 'raw');
    const signature = (r) => JSON.stringify([r.answer, r.sources.map((s) => s.id)]);
    return {
        verdict,
        first,
        shown: first.shown,
        firstRaw: rawIndex === -1 ? null : { rank: rawIndex + 1, of: q.ranking.length, recordId: q.ranking[rawIndex].recordId },
        seededIdentical: new Set(q.seeded.map(signature)).size === 1,
        distinctUnseeded: new Set(q.unseeded.map((r) => r.answer)).size,
        latency: median(q.seeded.map((r) => r.secs)),
        unseededLatency: median(q.unseeded.map((r) => r.secs)),
        reviewFlags: reviewRun({ answer: first.answer, sources: first.sources, raw: null }, first.shown.length).flags,
    };
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
        row('Chat model', (x) => `${x.model} @ ${x.modelDigest.slice(0, 12)}`),
        row('Embedding model', (x) => `${x.embedModel} @ ${x.embedModelDigest.slice(0, 12)}`),
        row('Ollama', (x) => x.ollamaVersion),
        row('Seed / temperature', (x) => `${x.seed} / ${x.temperature}`),
        row('Chat options', (x) => JSON.stringify(x.chatOptions)),
        row('Top k', (x) => x.topK),
        row('Runs per question', (x) => `${x.seededRuns} seeded, ${x.unseededRuns} unseeded`),
    ];
}

// A report on one result set, or before/after on two. Judged against the
// current gold file.
function renderReport(sets, gold) {
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
            `- Questions whose seeded runs weren't identical: ${join((s) => count(of(s), (x) => !x.seededIdentical))}`,
            '',
            '### Per question',
            '',
            '| Question | Gold | Shown | First raw | Cited | Raw cited | Uncited | Stacks 3+ | Unsupported figures | Distinct unseeded | Latency (s) |',
            '|---|---|---|---|---|---|---|---|---|---|---|',
        );
        for (const i of indexes) {
            const per = summaries.map((s) => s[i]);
            const col = (f) => per.map(f).join(' → ');
            lines.push(`| \`${ids[i]}\` | ${col((s) => (s.verdict.pass ? 'PASS' : '**FAIL**'))} | ${col((s) => s.shown.length)} | ${col(firstRawText)} | ${col((s) => s.verdict.cited.length)} | ${col((s) => (s.verdict.citesRaw ? 'yes' : 'no'))} | ${col((s) => s.verdict.uncited.length)} | ${col((s) => s.verdict.stacks.length)} | ${col((s) => s.verdict.unsupported.length)} | ${col((s) => `${s.distinctUnseeded}/${sets[per.indexOf(s)].metadata.unseededRuns}`)} | ${col((s) => s.latency)} |`);
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
            row('Seeded runs identical', (s) => (s.seededIdentical ? 'yes' : 'NO')),
            row('Distinct unseeded answers', (s) => `${s.distinctUnseeded} of ${sets[per.indexOf(s)].metadata.unseededRuns}`),
            row('Latency, median (s)', (s) => `${s.latency} seeded, ${s.unseededLatency ?? '—'} unseeded`),
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

function report({ labels }) {
    if (labels.length < 1 || labels.length > 2) throw new Error('report takes one result name, or two for before/after');
    const sets = labels.map((label) => {
        const file = path.join(RESULTS_DIR, `${label}.json`);
        if (!fs.existsSync(file)) throw new Error(`no results named ${label} (${path.relative(process.cwd(), file)})`);
        return readJson(file);
    });
    if (sets.length === 2) {
        for (const key of ['harnessVersion', 'corpusCommit', 'seed', 'temperature']) {
            if (sets[0].metadata[key] !== sets[1].metadata[key]) {
                throw new Error(`${labels[0]} and ${labels[1]} differ in ${key} (${sets[0].metadata[key]} vs ${sets[1].metadata[key]}); re-run one so they match`);
            }
        }
    }
    const out = path.join(RESULTS_DIR, `${labels.join('-vs-')}.md`);
    fs.writeFileSync(out, renderReport(sets, loadGold()));
    console.log(`Report: ${path.relative(process.cwd(), out)}`);
}

// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {
        command, label: null, seed: 42, temperature: CHAT_OPTIONS.temperature, seededRuns: 3, unseededRuns: 3, set: null, only: null, labels: [],
    };
    const count = (arg, raw, min) => {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < min) throw new Error(`${arg} must be an integer ≥ ${min}`);
        return n;
    };
    for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        const value = () => {
            if (i + 1 >= rest.length) throw new Error(`${arg} needs a value`);
            i += 1;
            return rest[i];
        };
        if (arg === '--label') {
            options.label = value();
            if (!/^[a-z0-9][a-z0-9._-]*$/.test(options.label)) throw new Error('--label must be lowercase letters, digits, ".", "_" or "-"');
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
        } else if (!arg.startsWith('--') && command === 'report') {
            options.labels.push(arg);
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
    if (options.command === 'run') return run(options);
    if (options.command === 'report') return report(options);
    throw new Error('usage: eval-ask.js run --label NAME [--seed N] [--temperature T] [--seeded-runs N] [--unseeded-runs N] [--set regression|scenario] [--only id,id] | report BEFORE [AFTER]');
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    });
}

module.exports = { answerSentences, analyseAnswer, judgeRun, claimText, renderReport, EVAL_HARNESS_VERSION };
