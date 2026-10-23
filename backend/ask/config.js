const { validateBedrockSettings, BEDROCK_DEFAULTS } = require('./bedrock');

const SUPPORTED_PROVIDERS = new Set(['ollama', 'bedrock', 'static']);

// LLM_PROVIDER is the switch between model backends:
//   ollama  live answers from a local Ollama.
//   bedrock live answers from Amazon Bedrock (ask/bedrock.js), with the
//           embeddings still from Ollama (resolveBedrockConfig below).
//   static  the public demo: no model at all. Visitors pick from questions
//           whose answers were captured earlier from the local model
//           (ask/static/answers.json, see ask/staticAnswers.js).
// Unset (or empty) means Ask the Repo is off and POST /api/ask answers 503.
// Any other value refuses to start, like a missing AGENTIC_REPO_ROOT, rather
// than silently serving nothing.
function resolveProvider(env) {
    const value = (env.LLM_PROVIDER || '').trim().toLowerCase();
    if (!value) return null;
    if (!SUPPORTED_PROVIDERS.has(value)) {
        throw new Error(
            `LLM_PROVIDER=${env.LLM_PROVIDER} is not supported. Use "ollama", "bedrock" or "static", or leave it unset to disable Ask the Repo.`,
        );
    }
    return value;
}

const DEFAULT_ASK_SEED = 42;

// ASK_SEED is the chat model's seed for live answers, so the same question
// on the same corpus gets the same text (on the same hardware and Ollama
// build). Unset (or empty) means DEFAULT_ASK_SEED. "random" sends no seed,
// for seeing how answers vary. Any other value that isn't an integer refuses
// to start, like an unsupported LLM_PROVIDER. Returns the seed, or undefined
// for "random". It applies to ollama only: Bedrock's Converse API takes no
// seed, so the bedrock pipeline is built without one (ask/activeProvider.js)
// and its answers vary from run to run whatever ASK_SEED says.
function resolveAskSeed(env) {
    const value = (env.ASK_SEED || '').trim();
    if (!value) return DEFAULT_ASK_SEED;
    if (value.toLowerCase() === 'random') return undefined;
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error(
            `ASK_SEED=${env.ASK_SEED} is not supported. Use an integer, or "random" for no seed, or leave it unset for ${DEFAULT_ASK_SEED}.`,
        );
    }
    return Number(value);
}

// LLM_PROVIDER=bedrock's settings (ask/bedrock.js), read when the server
// starts with it:
//   BEDROCK_MODEL_ID    required; an inference profile ID from
//                       BEDROCK_MODELS. Any other refuses to start.
//   BEDROCK_REGION      default us-east-1.
//   BEDROCK_MAX_TOKENS  default 4096: the reply's token limit. A reply that
//                       reaches it is an error, never an answer.
//   BEDROCK_EFFORT      default high; low, medium, high, xhigh or max. Sent
//                       to the Claude models only.
// Credentials come from the AWS SDK's default chain (AWS_PROFILE), never
// from here. Embeddings still use OLLAMA_BASE_URL and OLLAMA_EMBED_MODEL.
function resolveBedrockConfig(env) {
    const read = (name) => (env[name] || '').trim();
    const modelId = read('BEDROCK_MODEL_ID');
    if (!modelId) throw new Error('LLM_PROVIDER=bedrock needs BEDROCK_MODEL_ID.');
    const maxTokens = read('BEDROCK_MAX_TOKENS');
    const config = {
        modelId,
        region: read('BEDROCK_REGION') || BEDROCK_DEFAULTS.region,
        maxTokens: maxTokens ? (/^\d+$/.test(maxTokens) ? Number(maxTokens) : maxTokens) : BEDROCK_DEFAULTS.maxTokens,
        effort: read('BEDROCK_EFFORT').toLowerCase() || BEDROCK_DEFAULTS.effort,
    };
    validateBedrockSettings(config);
    return config;
}

module.exports = {
    resolveProvider, resolveAskSeed, resolveBedrockConfig, SUPPORTED_PROVIDERS, DEFAULT_ASK_SEED,
};
