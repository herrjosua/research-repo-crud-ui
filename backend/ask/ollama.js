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
};

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
        embedModel,
        chatModel,

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
