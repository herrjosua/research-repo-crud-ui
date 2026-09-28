import { api } from './client';
import { askRepo } from './ask';

function jsonResponse(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('api client', () => {
    it('resolves with the parsed body on success', async () => {
        vi.stubGlobal('fetch', vi.fn(() => jsonResponse(200, { ok: true })));

        await expect(api.get('/thing')).resolves.toEqual({ ok: true });
    });

    it('rejects with the server\'s error message and the HTTP status', async () => {
        vi.stubGlobal('fetch', vi.fn(() => jsonResponse(503, { error: 'ask the repo is not enabled on this server' })));

        const error = await api.post('/ask', {}).catch((err) => err);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('ask the repo is not enabled on this server');
        expect(error.status).toBe(503);
    });

    it('falls back to a generic message when the body isn\'t JSON', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('Bad Gateway', { status: 502 }))));

        const error = await api.get('/thing').catch((err) => err);

        expect(error.message).toBe('Request failed with status 502');
        expect(error.status).toBe(502);
    });

    it('passes options such as an abort signal through to fetch', async () => {
        const fetch = vi.fn(() => jsonResponse(200, {}));
        vi.stubGlobal('fetch', fetch);
        const { signal } = new AbortController();

        await api.post('/ask', { question: 'q' }, { signal });

        expect(fetch).toHaveBeenCalledWith('/api/ask', expect.objectContaining({ method: 'POST', signal, body: '{"question":"q"}' }));
    });
});

describe('askRepo', () => {
    it('posts the question with "all" for no project filter', async () => {
        const fetch = vi.fn(() => jsonResponse(200, { answer: 'a', sources: [], model: 'm' }));
        vi.stubGlobal('fetch', fetch);

        await askRepo({ question: 'Q?', project: null });

        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ question: 'Q?', project: 'all' });
    });
});
