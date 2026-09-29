// Minimal client for the two Ollama HTTP endpoints Ask the Repo needs —
// /api/embed and /api/chat — using Node's built-in fetch. The official
// `ollama` npm package would wrap exactly these two POSTs, so it isn't
// worth the dependency.

const DEFAULTS = {
    baseUrl: 'http://localhost:11434',
    embedModel: 'nomic-embed-text',
    chatModel: 'gemma2:9b',
    // Generation on a 9B model is seconds-to-a-minute locally, and the very
    // first call after the model is evicted also pays its load time.
    timeoutMs: 180_000,
    // checkReady() only asks Ollama for its model list, so a short wait
    // tells a stopped Ollama apart from a slow one quickly.
    readyTimeoutMs: 3_000,
};

// Ollama names a model without a tag as ":latest", so "nomic-embed-text"
// and "nomic-embed-text:latest" are the same model.
function withTag(name) {
    return name.includes(':') ? name : `${name}:latest`;
}

// Thrown for anything that goes wrong talking to Ollama (unreachable, non-2xx,
// malformed JSON, timeout). routes/ask.js turns it into a generic 502 and
// logs `detail` server-side only.
class OllamaError extends Error {
    constructor(message, detail) {
        super(message);
        this.name = 'OllamaError';
        this.detail = detail;
    }
}

function createOllamaClient({
    baseUrl = DEFAULTS.baseUrl,
    embedModel = DEFAULTS.embedModel,
    chatModel = DEFAULTS.chatModel,
    timeoutMs = DEFAULTS.timeoutMs,
    readyTimeoutMs = DEFAULTS.readyTimeoutMs,
} = {}) {
    const root = baseUrl.replace(/\/+$/, '');

    async function post(endpoint, body) {
        let res;
        try {
            res = await fetch(`${root}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (err) {
            throw new OllamaError(`Ollama ${endpoint} request failed`, err.message);
        }
        const text = await res.text();
        if (!res.ok) {
            throw new OllamaError(`Ollama ${endpoint} returned ${res.status}`, text.slice(0, 500));
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new OllamaError(`Ollama ${endpoint} returned invalid JSON`, text.slice(0, 500));
        }
    }

    return {
        baseUrl: root,
        embedModel,
        chatModel,

        // Resolves when Ollama answers and has both models pulled; rejects
        // with an OllamaError whose message says which of those failed.
        // GET /api/tags lists the pulled models without loading any.
        async checkReady() {
            let res;
            try {
                res = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(readyTimeoutMs) });
            } catch (err) {
                throw new OllamaError(`Ollama isn't reachable at ${root}`, err.message);
            }
            if (!res.ok) {
                throw new OllamaError(`Ollama at ${root} answered ${res.status}`, (await res.text()).slice(0, 500));
            }
            let data;
            try {
                data = await res.json();
            } catch (err) {
                throw new OllamaError(`Ollama at ${root} returned invalid JSON`, err.message);
            }
            const pulled = new Set((Array.isArray(data.models) ? data.models : []).map((model) => withTag(String(model.name))));
            const missing = [chatModel, embedModel].filter((name) => !pulled.has(withTag(name)));
            if (missing.length > 0) {
                throw new OllamaError(`Ollama at ${root} doesn't have ${missing.join(' or ')} (run: ollama pull ${missing.join(' && ollama pull ')})`);
            }
        },

        // One vector per input string, in order. Ollama's /api/embed takes the
        // whole batch in one request.
        async embed(inputs) {
            if (inputs.length === 0) return [];
            const data = await post('/api/embed', { model: embedModel, input: inputs });
            if (!Array.isArray(data.embeddings) || data.embeddings.length !== inputs.length) {
                throw new OllamaError('Ollama /api/embed returned the wrong number of embeddings');
            }
            return data.embeddings;
        },

        // Non-streaming chat; returns the assistant message's raw content.
        async chat(messages, options = {}) {
            const data = await post('/api/chat', { model: chatModel, messages, stream: false, options });
            const content = data && data.message && data.message.content;
            if (typeof content !== 'string') {
                throw new OllamaError('Ollama /api/chat returned no message content');
            }
            return content;
        },
    };
}

module.exports = { createOllamaClient, OllamaError, OLLAMA_DEFAULTS: DEFAULTS };
