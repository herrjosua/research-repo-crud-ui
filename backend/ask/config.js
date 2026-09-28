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

module.exports = { resolveProvider, SUPPORTED_PROVIDERS };
