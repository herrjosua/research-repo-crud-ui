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
// A reasoning model's reply can open with its thinking in <think>…</think>
// tags when Ollama doesn't split it into the message's separate `thinking`
// field (Ollama 0.34 does split it, for models whose /api/show capabilities
// include "thinking"). Only the final answer is kept. A reply that doesn't
// start with the tag, which is every reply from a model without thinking, is
// returned unchanged.
function finalAnswer(content) {
    const match = /^\s*<think>[\s\S]*?<\/think>\s*/.exec(content);
    return match ? content.slice(match[0].length) : content;
}

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
    // Ollama's top-level `think` chat parameter (false turns a reasoning
    // model's thinking off). Undefined, the default, leaves it out of the
    // request, so a model without thinking gets exactly the request it
    // always did. Only the evaluation harness sets it (scripts/eval-ask.js).
    think,
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

    // Non-streaming chat; resolves to { content, thinking, stats }:
    // `content` the assistant message's final answer (finalAnswer()),
    // `thinking` whatever reasoning the model returned apart from it ("" when
    // none), and `stats` Ollama's token counts and timings (null where
    // Ollama doesn't report them).
    async function chatDetailed(messages, options = {}) {
        const body = { model: chatModel, messages, stream: false, options };
        if (think !== undefined) body.think = think;
        const data = await post('/api/chat', body);
        const content = data && data.message && data.message.content;
        if (typeof content !== 'string') {
            throw new OllamaError('Ollama /api/chat returned no message content');
        }
        const tagged = /^\s*<think>([\s\S]*?)<\/think>/.exec(content);
        // Never part of the answer: the pipeline only ever sees `content`.
        const separate = typeof data.message.thinking === 'string' ? data.message.thinking : '';
        const secs = (ns) => (typeof ns === 'number' ? ns / 1e9 : null);
        const count = (n) => (typeof n === 'number' ? n : null);
        return {
            content: finalAnswer(content),
            thinking: separate || (tagged ? tagged[1].trim() : ''),
            stats: {
                promptTokens: count(data.prompt_eval_count),
                evalTokens: count(data.eval_count),
                promptSecs: secs(data.prompt_eval_duration),
                evalSecs: secs(data.eval_duration),
                loadSecs: secs(data.load_duration),
                totalSecs: secs(data.total_duration),
            },
        };
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

        chatDetailed,

        // Non-streaming chat; returns the assistant message's final answer.
        async chat(messages, options = {}) {
            return (await chatDetailed(messages, options)).content;
        },
    };
}

module.exports = {
    createOllamaClient, OllamaError, finalAnswer, OLLAMA_DEFAULTS: DEFAULTS,
};
