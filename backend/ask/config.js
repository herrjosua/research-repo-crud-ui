const SUPPORTED_PROVIDERS = new Set(['ollama', 'static']);

// LLM_PROVIDER is the switch between model backends:
//   ollama  live answers from a local Ollama.
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
            `LLM_PROVIDER=${env.LLM_PROVIDER} is not supported. Use "ollama" or "static", or leave it unset to disable Ask the Repo.`,
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
// for "random".
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

module.exports = {
    resolveProvider, resolveAskSeed, SUPPORTED_PROVIDERS, DEFAULT_ASK_SEED,
};
