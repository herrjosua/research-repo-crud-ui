import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAskConfig } from './ask';
import { useSetDevProvider } from './dev';

function jsonResponse(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

const LIVE = { enabled: true, mode: 'live', projects: [] };
const STATIC = { enabled: true, mode: 'static', projects: [], questions: [], capture: { model: 'gemma2:9b', capturedAt: '2026-09-28T12:00:00.000Z' } };

afterEach(() => {
    vi.unstubAllGlobals();
});

// The real hooks against a stubbed fetch: what a switch does to the Ask
// config's query, which the Ask page's loading state reads (`isPending`).
function setup(routes) {
    const fetch = vi.fn((url, options) => routes(url, options));
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient();
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({ config: useAskConfig(), setProvider: useSetDevProvider() }), { wrapper });
    return { result, client, fetch };
}

describe('useSetDevProvider', () => {
    it('on success, puts the Ask config back to pending (its loading state) until the new mode loads', async () => {
        let mode = LIVE;
        let releaseConfig = null;
        const { result, client } = setup((url, options) => {
            if (url === '/api/dev/provider' && options.method === 'POST') {
                mode = STATIC;
                return jsonResponse(200, { provider: 'static' });
            }
            if (url === '/api/ask/config') {
                // Hold the refetch after a switch, so the pending state can be seen.
                if (mode === STATIC) return new Promise((resolve) => { releaseConfig = () => resolve(jsonResponse(200, STATIC)); });
                return jsonResponse(200, mode);
            }
            return jsonResponse(404, { error: 'not found' });
        });
        await waitFor(() => expect(result.current.config.data).toEqual(LIVE));

        await act(async () => { await result.current.setProvider.mutateAsync('static'); });

        await waitFor(() => expect(result.current.config.isPending).toBe(true));
        expect(result.current.config.data).toBeUndefined();
        expect(client.getQueryData(['dev', 'provider'])).toEqual({ provider: 'static' });

        await act(async () => { releaseConfig(); });
        await waitFor(() => expect(result.current.config.data).toEqual(STATIC));
        expect(result.current.config.isPending).toBe(false);
    });

    it('on failure, leaves the Ask config as it was', async () => {
        const { result, fetch } = setup((url, options) => {
            if (url === '/api/dev/provider' && options.method === 'POST') {
                return jsonResponse(502, { error: "Ollama isn't reachable at http://localhost:11434" });
            }
            return jsonResponse(200, LIVE);
        });
        await waitFor(() => expect(result.current.config.data).toEqual(LIVE));
        const configFetches = () => fetch.mock.calls.filter(([url]) => url === '/api/ask/config').length;
        const before = configFetches();

        const error = await act(async () => result.current.setProvider.mutateAsync('ollama').catch((err) => err));

        expect(error.status).toBe(502);
        expect(error.message).toBe("Ollama isn't reachable at http://localhost:11434");
        expect(result.current.config.data).toEqual(LIVE);
        expect(result.current.config.isPending).toBe(false);
        expect(configFetches()).toBe(before);
    });
});
