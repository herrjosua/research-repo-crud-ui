// The provider Ask the Repo answers with right now. It starts as
// LLM_PROVIDER (see ./config.js) and changes only through the dev-only
// POST /api/dev/provider (routes/dev.js), which is never registered in
// production. It lives in this process's memory, so a restart goes back to
// LLM_PROVIDER.
//
// routes/ask.js reads get() once per request, so a request finishes with
// the provider it started on even if the provider is switched while it runs.
// The static answers and each live provider's pipeline (ollama, bedrock) are
// built the first time they're needed and then kept. Both pipelines share
// one embedding index built on the Ollama client's embed, so switching back
// to ollama reuses the embeddings already computed, and bedrock embeds with
// Ollama too (OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL). The dev switch
// (routes/dev.js) only offers static and ollama; bedrock is only ever
// LLM_PROVIDER.

const { resolveProvider, resolveAskSeed, resolveBedrockConfig } = require('./config');
const { createOllamaClient, OLLAMA_DEFAULTS } = require('./ollama');
const { createBedrockClient } = require('./bedrock');
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
// Checked at startup whatever the provider, so a bad ASK_SEED can't wait
// for a later switch to ollama to surface.
const askSeed = resolveAskSeed(process.env);
// Checked at startup too, and only for bedrock: an unknown BEDROCK_MODEL_ID
// refuses to start, like an unknown LLM_PROVIDER.
const bedrockConfig = provider === 'bedrock' ? resolveBedrockConfig(process.env) : null;
let ollama = null;
let bedrock = null;
let index = null;
const pipelines = {};
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

// Builds no client and makes no network call: the SDK loads on the first
// chat (ask/bedrock.js).
function getBedrock() {
    if (!bedrock) bedrock = createBedrockClient(bedrockConfig);
    return bedrock;
}

function getIndex() {
    if (!index) index = createEmbeddingIndex({ embed: getOllama().embed, loadRecords });
    return index;
}

// The live pipeline for `name`, ollama unless bedrock is asked for. Bedrock
// gets no seed: Converse has none (ask/config.js resolveAskSeed).
function getPipeline(name = 'ollama') {
    if (!pipelines[name]) {
        pipelines[name] = name === 'bedrock'
            ? createAskPipeline({ ollama: getBedrock(), index: getIndex(), seed: undefined })
            : createAskPipeline({ ollama: getOllama(), index: getIndex(), seed: askSeed });
    }
    return pipelines[name];
}

// Throws if the answers file is missing or invalid (see loadStaticAnswers).
function getStaticAnswers() {
    if (!staticAnswers) staticAnswers = loadStaticAnswers(answersFile);
    return staticAnswers;
}

// Static mode at startup: read and validated now, so a missing or broken
// file stops the server instead of failing each request. Live mode and a
// disabled Ask never read it, so they start without it. Live mode builds
// its client now too; that makes no network call (and for bedrock loads no
// SDK).
if (provider === 'static') getStaticAnswers();
if (provider === 'ollama') getOllama();
if (provider === 'bedrock') getBedrock();

module.exports = {
    get: () => provider,
    // Callers check the new provider is usable first (routes/dev.js).
    set: (next) => { provider = next; },
    getOllama,
    getBedrock,
    getPipeline,
    getStaticAnswers,
};
