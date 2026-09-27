const http = require('http');

const DIMENSIONS = 768; // nomic-embed-text's size

// Deterministic stand-in for nomic-embed-text: a hashed bag of words, so texts
// sharing words really do score closer under cosine similarity and retrieval
// ranks meaningfully. The task prefix ("search_document: ", "search_query: ")
// is dropped first so it doesn't make every text look alike.
function fakeEmbedding(text) {
    const vector = new Array(DIMENSIONS).fill(0);
    const words = text.replace(/^search_(document|query):\s*/, '').toLowerCase().match(/[a-z0-9]+/g) || [];
    for (const word of words) {
        if (word.length < 3) continue;
        let hash = 0;
        for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        vector[hash % DIMENSIONS] += 1;
    }
    return vector;
}

/**
 * A real HTTP server speaking the two Ollama endpoints ask/ollama.js calls,
 * with Ollama's actual request/response JSON shapes. Every request body is
 * recorded in `requests` so tests can assert on what the backend sent.
 *
 * `chatReply(body)` returns the assistant's content for a /api/chat call.
 * Set `failNext` to a status code to make the next request fail with it.
 */
async function startFakeOllama({ chatReply }) {
    const state = { requests: [], failNext: null };

    const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            const body = raw ? JSON.parse(raw) : {};
            state.requests.push({ path: req.url, body });
            res.setHeader('Content-Type', 'application/json');

            if (state.failNext) {
                res.statusCode = state.failNext;
                state.failNext = null;
                return res.end(JSON.stringify({ error: 'model runner has unexpectedly stopped' }));
            }
            if (req.method === 'POST' && req.url === '/api/embed') {
                return res.end(JSON.stringify({
                    model: body.model,
                    embeddings: body.input.map(fakeEmbedding),
                    total_duration: 1000,
                    load_duration: 10,
                    prompt_eval_count: body.input.length,
                }));
            }
            if (req.method === 'POST' && req.url === '/api/chat') {
                return res.end(JSON.stringify({
                    model: body.model,
                    created_at: new Date().toISOString(),
                    message: { role: 'assistant', content: chatReply(body) },
                    done: true,
                    done_reason: 'stop',
                    total_duration: 1000,
                    eval_count: 42,
                }));
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'not found' }));
        });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    return {
        url: `http://127.0.0.1:${port}`,
        state,
        requestsTo(endpoint) {
            return state.requests.filter((r) => r.path === endpoint);
        },
        reset() {
            state.requests.length = 0;
            state.failNext = null;
        },
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

module.exports = { startFakeOllama, fakeEmbedding };
