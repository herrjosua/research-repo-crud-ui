// One Ask the Repo question, end to end: retrieve, prompt, generate, clean
// up, cite. POST /api/ask (routes/ask.js) and the static demo's capture
// script (scripts/capture-static-answers.js) both run questions through this,
// so a captured answer is exactly what the live route would have returned.

const { rankRecords } = require('./retrieval');
const { wholeNotesText } = require('./corpus');
const { provenanceLinks, withProvenanceSlot } = require('./provenance');
const { buildMessages, renumberCitations, toSource } = require('./answer');
const { toPlainText } = require('./plainText');
const { checkAnswer } = require('./checks');

// What the model is shown per question (backend/README.md, "Retrieval"):
//   topK            records, each by its best-matching passage. Six is a
//                   prompt of ~4–5k characters: enough to synthesize across
//                   sessions, small enough for a 9B model to stay grounded.
//                   Eight cost a passing answer (docs/decisions.md).
//   metadataSections  rosters and link lists are never retrieved
//                   (ask/corpus.js METADATA_SECTIONS); a raw session's roster
//                   is a one-line header on its sources instead.
//   provenanceSlot  when no raw session a shown synthesis or doc record was
//                   built from is in the top k, the best-ranked one replaces
//                   the lowest non-raw record (ask/provenance.js). Off: it
//                   cost a passing answer and gained none in the evaluation
//                   (docs/decisions.md).
//   passagesPerRaw  passages shown per raw session, its best-scoring ones,
//                   in the order they appear in the record; every other
//                   record gets one. A session's best passage is often
//                   its Objective, and the second can bring in the
//                   findings or quotes it leaves out.
//   wholeRawNotes   0 (off), or N: the raw sessions in the top k are
//                   dropped, and the top N raw sessions of the whole
//                   ranking are shown instead, each as its whole notes
//                   (ask/corpus.js wholeNotesText) under one label, with
//                   its roster header. Synthesis and doc records are
//                   shown as without it, and every record stays in
//                   ranking order. passagesPerRaw doesn't apply.
// The evaluation harness records this with every result.
const RETRIEVAL = {
    topK: 6, metadataSections: 'excluded', provenanceSlot: false, passagesPerRaw: 2, wholeRawNotes: 0,
};
const TOP_K = RETRIEVAL.topK;
// Low temperature: this is retrieval-grounded summarization, not writing.
const CHAT_OPTIONS = { temperature: 0.2, num_ctx: 8192 };

// The wholeRawNotes selection (RETRIEVAL above): the non-raw records of
// `chosen` and the top `n` raw sessions of `ranked`, in ranking order, a raw
// session as one passage holding its whole notes. Its id is
// "<record id>#notes", and it has no neighbours for the sources panel.
function withWholeRawNotes(ranked, chosen, n) {
    const raw = ranked.filter((r) => r.record.kind === 'raw').slice(0, n);
    const shown = new Set([...chosen.filter((r) => r.record.kind !== 'raw'), ...raw]);
    return ranked.filter((r) => shown.has(r)).map((r) => {
        if (r.record.kind !== 'raw') return r.passages[0];
        const { record, participants } = r.passages[0].passage;
        return {
            passage: {
                record,
                chunk: { heading: null, text: wholeNotesText(record), index: 'notes' },
                participants,
                previous: null,
                next: null,
            },
            score: r.score,
        };
    });
}

// `ollama` is an ask/ollama.js client; `index` an embedding index built on it
// (ask/retrieval.js). ask() resolves to the response body POST /api/ask
// sends, plus `raw` (the model's unprocessed reply, or null when the model
// wasn't called), `ranked` (the passages it was shown, in [n] order) for
// the capture script's review report, and `promptChars` (the prompt's size,
// system and user messages, for the evaluation harness). Ollama failures
// reject with OllamaError.
//
// select() is what the model is shown: RETRIEVAL applied to the in-scope
// records, as { passage, score } in [n] order, a record's passages together
// ([] when no record has the project tag). rank() is the similarity ranking
// alone: every in-scope record's best passage, best first, `k` of them. The
// evaluation harness calls it with k = Infinity to see where every record
// ranks. `retrieval` overrides RETRIEVAL, for tests.
function createAskPipeline({ ollama, index, retrieval = RETRIEVAL }) {
    async function rankInScope(question, project) {
        const { passages, records } = await index.refresh();
        const inScope = project
            ? passages.filter(({ record }) => Array.isArray(record.tags) && record.tags.includes(project))
            : passages;
        if (inScope.length === 0) return { ranked: [], records };
        return { ranked: rankRecords(await index.embedQuery(question), inScope), records };
    }

    async function rank(question, project, k = retrieval.topK) {
        const { ranked } = await rankInScope(question, project);
        return ranked.slice(0, k).map((r) => r.passages[0]);
    }

    async function select(question, project) {
        const { ranked, records } = await rankInScope(question, project);
        const chosen = retrieval.provenanceSlot
            ? withProvenanceSlot(ranked, retrieval.topK, provenanceLinks(records))
            : ranked.slice(0, retrieval.topK);
        if (retrieval.wholeRawNotes > 0) return withWholeRawNotes(ranked, chosen, retrieval.wholeRawNotes);
        return chosen.flatMap((r) => r.passages
            .slice(0, r.record.kind === 'raw' ? retrieval.passagesPerRaw : 1)
            .sort((a, b) => a.passage.chunk.index - b.passage.chunk.index));
    }

    async function ask(question, project) {
        const ranked = await select(question, project);

        if (ranked.length === 0) {
            return {
                answer: `No records in the repo are tagged "${project}", so there's nothing to answer from.`,
                sources: [],
                model: ollama.chatModel,
                // Nothing the model wrote, so nothing to check.
                checks: { retried: false, ...checkAnswer('', []) },
                raw: null,
                ranked: [],
                promptChars: 0,
            };
        }

        const messages = buildMessages(question, ranked);
        const raw = await ollama.chat(messages, CHAT_OPTIONS);
        const { text, cited } = renumberCitations(toPlainText(raw), ranked.length);
        const sources = cited.map((i) => toSource(ranked[i], project));

        return {
            answer: text || "The model didn't return an answer. Try rephrasing the question.",
            sources,
            model: ollama.chatModel,
            // Flags only: the answer is returned as the model wrote it
            // (ask/checks.js). `text` rather than the fallback message, which
            // the model didn't write.
            checks: { retried: false, ...checkAnswer(text, sources, question) },
            raw,
            ranked,
            promptChars: messages.reduce((n, m) => n + m.content.length, 0),
        };
    }

    return { ask, rank, select };
}

module.exports = { createAskPipeline, TOP_K, RETRIEVAL, CHAT_OPTIONS };
