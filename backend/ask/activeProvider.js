// The provider Ask the Repo answers with right now. It starts as
// LLM_PROVIDER (see ./config.js) and changes only through the dev-only
// POST /api/dev/provider (routes/dev.js), which is never registered in
// production. It lives in this process's memory, so a restart goes back to
// LLM_PROVIDER.
//
// routes/ask.js reads get() once per request, so a request finishes with
// the provider it started on even if the provider is switched while it runs.
// The static answers and the Ollama pipeline are each built the first time
// they're needed and then kept, so switching back to ollama reuses the
// embeddings already computed.

const { resolveProvider } = require('./config');
const { createOllamaClient, OLLAMA_DEFAULTS } = require('./ollama');
const { loadRecords } = require('./corpus');
const { createEmbeddingIndex } = require('./retrieval');
const { createAskPipeline } = require('./pipeline');
const { loadStaticAnswers, ANSWERS_FILE } = require('./staticAnswers');

// ASK_STATIC_ANSWERS_FILE is test-only: under NODE_ENV=test (set by Jest) it
// points at a fixture instead. Everywhere else it's ignored, so a deployed
// server always serves the checked-in file.
const answersFile = process.env.NODE_ENV === 'test' && process.env.ASK_STATIC_ANSWERS_FILE
    ? process.env.ASK_STATIC_ANSWERS_FILE
    : ANSWERS_FILE;

let provider = resolveProvider(process.env);
let ollama = null;
let pipeline = null;
let staticAnswers = null;

function getOllama() {
    if (!ollama) {
        ollama = createOllamaClient({
            baseUrl: process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl,
            embedModel: process.env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
            chatModel: process.env.OLLAMA_CHAT_MODEL || OLLAMA_DEFAULTS.chatModel,
        });
    }
    return ollama;
}

function getPipeline() {
    if (!pipeline) {
        const client = getOllama();
        pipeline = createAskPipeline({ ollama: client, index: createEmbeddingIndex({ embed: client.embed, loadRecords }) });
    }
    return pipeline;
}

// Throws if the answers file is missing or invalid (see loadStaticAnswers).
function getStaticAnswers() {
    if (!staticAnswers) staticAnswers = loadStaticAnswers(answersFile);
    return staticAnswers;
}

// Static mode at startup: read and validated now, so a missing or broken
// file stops the server instead of failing each request. Live mode and a
// disabled Ask never read it, so they start without it. Live mode builds
// its client now too; that makes no network call.
if (provider === 'static') getStaticAnswers();
if (provider === 'ollama') getOllama();

module.exports = {
    get: () => provider,
    // Callers check the new provider is usable first (routes/dev.js).
    set: (next) => { provider = next; },
    getOllama,
    getPipeline,
    getStaticAnswers,
};
