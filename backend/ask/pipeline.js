// One Ask the Repo question, end to end: retrieve, prompt, generate, clean
// up, cite. POST /api/ask (routes/ask.js) and the static demo's capture
// script (scripts/capture-static-answers.js) both run questions through this,
// so a captured answer is exactly what the live route would have returned.

const { rankRecords } = require('./retrieval');
const { wholeNotesText, FOLLOW_UPS_HEADING } = require('./corpus');
const { provenanceLinks, withProvenanceSlot } = require('./provenance');
const {
    buildMessages, renumberCitations, toSource, sourceClass, PROMPT_BEHAVIORS,
} = require('./answer');
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
//   followUps       false (off), 'shown' or 'linked': when the question
//                   asks what is unresolved (asksWhatIsUnresolved), the
//                   Follow-ups / Open Questions passages of the raw
//                   sessions shown are added to them ('shown'), and with
//                   'linked' also those of the raw sessions linked
//                   (ask/provenance.js) to the two best-ranked synthesis
//                   records (withFollowUps). Off, or when the question
//                   doesn't ask that, the selection is unchanged.
// The evaluation harness records this with every result.
const RETRIEVAL = {
    topK: 6, metadataSections: 'excluded', provenanceSlot: false, passagesPerRaw: 2, wholeRawNotes: 0, followUps: false,
};
const TOP_K = RETRIEVAL.topK;
// Low temperature: this is retrieval-grounded summarization, not writing.
const CHAT_OPTIONS = { temperature: 0.2, num_ctx: 8192 };
// A prompt past num_ctx isn't refused: Ollama keeps what fits and answers,
// without saying so. ask() warns when Ollama's count of the prompt's tokens
// (prompt_eval_count, which counts the whole prompt even when Ollama reuses
// its cache) is over this share of num_ctx. The answer shares the window,
// since num_predict isn't set, so 85% leaves roughly 1,200 tokens for it.
const PROMPT_WARN_SHARE = 0.85;

// The chat reply and Ollama's count of the prompt's tokens. A client with
// chatDetailed() (ask/ollama.js) gives the count; one with only chat() (the
// tests' stubs) gives null.
async function chatWithPromptTokens(ollama, messages, options) {
    if (typeof ollama.chatDetailed !== 'function') {
        return { content: await ollama.chat(messages, options), promptTokens: null };
    }
    const { content, stats } = await ollama.chatDetailed(messages, options);
    return { content, promptTokens: stats && typeof stats.promptTokens === 'number' ? stats.promptTokens : null };
}

// The warning ask() logs for a prompt near or past num_ctx, or null.
function promptSizeWarning(promptTokens, numCtx = CHAT_OPTIONS.num_ctx) {
    if (promptTokens === null || promptTokens <= PROMPT_WARN_SHARE * numCtx) return null;
    return `Ask the Repo: the prompt was ${promptTokens} tokens, over ${Math.round(PROMPT_WARN_SHARE * 100)}% of num_ctx ${numCtx}; `
        + 'Ollama may have cut it or left too little room for the answer.';
}

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

// The followUps trigger: a question asking what is unresolved, still open
// or not yet learned ("What haven't we learned yet about care
// coordinators?", "What is unresolved about the session timeout?"), and not
// one asking what was decided or found. Frozen for RR-145: measured as
// written, so it isn't edited without a new measurement. Curly apostrophes
// read as straight ones, so "haven’t" matches.
const UNRESOLVED_RE = /\b(unresolved|undecided|unanswered|outstanding|still open|open (questions?|items?|issues?))\b|\b(haven't|have not|hasn't|has not)\b(\s+\w+){0,2}\s+(learned|learnt|found out|figured out|answered|resolved|decided|settled|confirmed)\b|\bnot (yet )?(known|learned|resolved|decided|answered|settled|confirmed)\b|\bstill (unknown|unclear|undecided|(don't|do not|not) know)\b/i;

function asksWhatIsUnresolved(question) {
    return UNRESOLVED_RE.test(String(question).replace(/[‘’]/g, "'"));
}

const FOLLOW_UPS_MODES = [false, 'shown', 'linked'];

// The followUps attachment (RETRIEVAL above), given the in-scope ranking,
// the selection and the provenance links. Each raw session in the
// selection gets its Follow-ups passages among its own, in record order.
// With 'linked', a raw session linked to one of the two best-ranked
// SYNTHESIS records (ask/answer.js sourceClass: findings and analytics)
// that isn't otherwise shown gets them after every selected record, in the
// order its synthesis record ranks, then link order. They're the ranking's
// own { passage, score } entries, so a session outside the project filter
// (not in the ranking) is never added. Skipped: a passage already selected,
// and a session shown whole (wholeRawNotes). `attached` is the added
// passages' ids, "<record id>#<chunk index>", in [n] order.
function withFollowUps(ranked, selection, mode, links) {
    const byId = new Map(ranked.map((r) => [r.record.id, r]));
    const idOf = ({ passage }) => `${passage.record.id}#${passage.chunk.index}`;
    const selected = new Set(selection.map(idOf));
    const shown = new Set(selection.map(({ passage }) => passage.record.id));
    const followUps = (recordId) => (byId.get(recordId)?.passages || [])
        .filter((p) => p.passage.chunk.heading === FOLLOW_UPS_HEADING && !selected.has(idOf(p)))
        .sort((a, b) => a.passage.chunk.index - b.passage.chunk.index);

    const out = [];
    for (let i = 0; i < selection.length;) {
        const { record } = selection[i].passage;
        let end = i;
        while (end < selection.length && selection[end].passage.record === record) end += 1;
        const group = selection.slice(i, end);
        const whole = group.some(({ passage }) => passage.chunk.index === 'notes');
        out.push(...(record.kind !== 'raw' || whole ? group : [...group, ...followUps(record.id)]
            .sort((a, b) => a.passage.chunk.index - b.passage.chunk.index)));
        i = end;
    }
    if (mode === 'linked') {
        const synthesis = ranked.filter((r) => sourceClass(r.record) === 'SYNTHESIS').slice(0, 2);
        const linked = new Set(synthesis.flatMap((r) => [...(links.get(r.record.id) || [])]));
        for (const recordId of linked) if (!shown.has(recordId)) out.push(...followUps(recordId));
    }
    return { selection: out, attached: out.filter((p) => !selected.has(idOf(p))).map(idOf) };
}

// `ollama` is an ask/ollama.js client; `index` an embedding index built on it
// (ask/retrieval.js). ask() resolves to the response body POST /api/ask
// sends, plus `raw` (the model's unprocessed reply, or null when the model
// wasn't called), `ranked` (the passages it was shown, in [n] order) for
// the capture script's review report, `promptChars` (the prompt's size,
// system and user messages, for the evaluation harness) and `promptTokens`
// (Ollama's prompt_eval_count, or null when the client doesn't report it;
// over PROMPT_WARN_SHARE of num_ctx it's also logged). Ollama failures
// reject with OllamaError.
//
// select() is what the model is shown: RETRIEVAL applied to the in-scope
// records, as { passage, score } in [n] order, a record's passages together
// ([] when no record has the project tag). rank() is the similarity ranking
// alone: every in-scope record's best passage, best first, `k` of them. The
// evaluation harness calls it with k = Infinity to see where every record
// ranks. `retrieval` overrides RETRIEVAL and `promptBehaviors`
// PROMPT_BEHAVIORS (ask/answer.js), for the evaluation and tests. With
// followUps on, ask() also resolves to `followUps`: { fired, attached },
// whether the question set the trigger off and the passage ids added.
function createAskPipeline({
    ollama, index, retrieval = RETRIEVAL, promptBehaviors = PROMPT_BEHAVIORS,
}) {
    if (retrieval.followUps !== undefined && !FOLLOW_UPS_MODES.includes(retrieval.followUps)) {
        throw new Error(`retrieval.followUps must be false, 'shown' or 'linked', not ${JSON.stringify(retrieval.followUps)}`);
    }

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

    function selectFrom(ranked, records) {
        const chosen = retrieval.provenanceSlot
            ? withProvenanceSlot(ranked, retrieval.topK, provenanceLinks(records))
            : ranked.slice(0, retrieval.topK);
        if (retrieval.wholeRawNotes > 0) return withWholeRawNotes(ranked, chosen, retrieval.wholeRawNotes);
        return chosen.flatMap((r) => r.passages
            .slice(0, r.record.kind === 'raw' ? retrieval.passagesPerRaw : 1)
            .sort((a, b) => a.passage.chunk.index - b.passage.chunk.index));
    }

    // The selection, and with followUps on, what it did ({ fired, attached }).
    async function selectWithFollowUps(question, project) {
        const { ranked, records } = await rankInScope(question, project);
        const selection = selectFrom(ranked, records);
        if (!retrieval.followUps) return { selection, followUps: null };
        if (!asksWhatIsUnresolved(question)) return { selection, followUps: { fired: false, attached: [] } };
        const links = retrieval.followUps === 'linked' ? provenanceLinks(records) : new Map();
        const { selection: attachedTo, attached } = withFollowUps(ranked, selection, retrieval.followUps, links);
        return { selection: attachedTo, followUps: { fired: true, attached } };
    }

    async function select(question, project) {
        return (await selectWithFollowUps(question, project)).selection;
    }

    async function ask(question, project) {
        const { selection: ranked, followUps } = await selectWithFollowUps(question, project);
        const followUpsField = followUps ? { followUps } : {};

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
                promptTokens: null,
                ...followUpsField,
            };
        }

        const messages = buildMessages(question, ranked, promptBehaviors);
        const { content: raw, promptTokens } = await chatWithPromptTokens(ollama, messages, CHAT_OPTIONS);
        const warning = promptSizeWarning(promptTokens);
        if (warning) console.warn(warning);
        const { text, cited } = renumberCitations(toPlainText(raw), ranked.length);
        const sources = cited.map((i) => toSource(ranked[i], project));

        return {
            answer: text || "The model didn't return an answer. Try rephrasing the question.",
            sources,
            model: ollama.chatModel,
            // Flags only: the answer is returned as the model wrote it
            // (ask/checks.js). `text` rather than the fallback message, which
            // the model didn't write.
            // `ranked` as sources too: an uncited decline may repeat
            // figures from anything the prompt showed.
            checks: { retried: false, ...checkAnswer(text, sources, question, ranked.map((r) => toSource(r, project))) },
            raw,
            ranked,
            promptChars: messages.reduce((n, m) => n + m.content.length, 0),
            promptTokens,
            ...followUpsField,
        };
    }

    return { ask, rank, select };
}

module.exports = {
    createAskPipeline, promptSizeWarning, asksWhatIsUnresolved, TOP_K, RETRIEVAL, CHAT_OPTIONS, PROMPT_WARN_SHARE,
};
