// One Ask the Repo question, end to end: retrieve, prompt, generate, clean
// up, cite. POST /api/ask (routes/ask.js) and the static demo's capture
// script (scripts/capture-static-answers.js) both run questions through this,
// so a captured answer is exactly what the live route would have returned.

const { rankPassages } = require('./retrieval');
const { buildMessages, renumberCitations, toSource } = require('./answer');
const { toPlainText } = require('./plainText');

// Records handed to the model per question. Six best-matching passages (one
// per record) is ~3–4k characters of context: enough to synthesize across
// sessions, small enough for a 9B model to stay grounded.
const TOP_K = 6;
// Low temperature: this is retrieval-grounded summarization, not writing.
const CHAT_OPTIONS = { temperature: 0.2, num_ctx: 8192 };

// `ollama` is an ask/ollama.js client; `index` an embedding index built on it
// (ask/retrieval.js). ask() resolves to the response body POST /api/ask
// sends, plus `raw` (the model's unprocessed reply, or null when the model
// wasn't called) and `ranked` (the passages it was shown, in [n] order) for
// the capture script's review report. Ollama failures reject with
// OllamaError.
function createAskPipeline({ ollama, index }) {
    async function ask(question, project) {
        const { passages } = await index.refresh();
        const inScope = project
            ? passages.filter(({ record }) => Array.isArray(record.tags) && record.tags.includes(project))
            : passages;

        if (inScope.length === 0) {
            return {
                answer: `No records in the repo are tagged "${project}", so there's nothing to answer from.`,
                sources: [],
                model: ollama.chatModel,
                raw: null,
                ranked: [],
            };
        }

        const ranked = rankPassages(await index.embedQuery(question), inScope, TOP_K);
        const raw = await ollama.chat(buildMessages(question, ranked), CHAT_OPTIONS);
        const { text, cited } = renumberCitations(toPlainText(raw), ranked.length);

        return {
            answer: text || "The model didn't return an answer. Try rephrasing the question.",
            sources: cited.map((i) => toSource(ranked[i], project)),
            model: ollama.chatModel,
            raw,
            ranked,
        };
    }

    return { ask };
}

module.exports = { createAskPipeline, TOP_K, CHAT_OPTIONS };
