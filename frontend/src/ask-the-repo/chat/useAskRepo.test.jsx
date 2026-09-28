import { act, renderHook, waitFor } from '@testing-library/react';
import { useAskRepo, latestAssistantMessage, titleFrom, previewFrom, SLOW_AFTER_MS } from './useAskRepo';

const SOURCE = { id: 'raw:a#1', kind: 'transcript', title: 'Usability Test — v1', excerpt: '…', project: null, recordProject: 'project-prior-auth', date: 'Apr 8, 2025' };
const ANSWER = { answer: 'Drafts cited outdated codes [1].\nSecond line.', sources: [SOURCE], model: 'gemma2:9b' };

function httpError(status) {
    return Object.assign(new Error(`status ${status}`), { status });
}

// A request whose outcome the test decides later.
function deferredAsk() {
    const calls = [];
    const ask = vi.fn((body, { signal }) => new Promise((resolve, reject) => {
        calls.push({ body, signal, resolve, reject });
    }));
    return { ask, calls };
}

describe('useAskRepo', () => {
    it('starts empty', () => {
        const { result } = renderHook(() => useAskRepo({ ask: vi.fn() }));

        expect(result.current.conversations).toEqual([]);
        expect(result.current.getMessages('anything')).toEqual([]);
        expect(result.current.getRequest('anything')).toEqual({ status: 'idle', slow: false, error: null });
    });

    it('creates a conversation from the first question and answers it', async () => {
        const { ask, calls } = deferredAsk();
        const { result } = renderHook(() => useAskRepo({ ask }));

        let id;
        act(() => { id = result.current.send(null, 'project-prior-auth', '  What made the drafts hard to review?  '); });

        expect(ask).toHaveBeenCalledWith(
            { question: 'What made the drafts hard to review?', project: 'project-prior-auth' },
            { signal: expect.any(AbortSignal) },
        );
        expect(result.current.conversations).toEqual([
            expect.objectContaining({ id, title: 'What made the drafts hard to review?', project: 'project-prior-auth', lastMessage: '' }),
        ]);
        expect(result.current.getMessages(id)).toEqual([expect.objectContaining({ role: 'user', content: 'What made the drafts hard to review?' })]);
        expect(result.current.getRequest(id).status).toBe('loading');

        await act(async () => calls[0].resolve(ANSWER));

        expect(result.current.getRequest(id).status).toBe('idle');
        const reply = latestAssistantMessage(result.current.getMessages(id));
        expect(reply).toMatchObject({ role: 'assistant', content: ANSWER.answer, sources: [SOURCE], model: 'gemma2:9b' });
        expect(result.current.conversations[0].lastMessage).toBe('Drafts cited outdated codes.');
        expect(result.current.announcement.trim()).toBe('Answer received, 1 source cited.');
    });

    it('adds later questions to the same conversation, newest conversations first', async () => {
        const ask = vi.fn().mockResolvedValue(ANSWER);
        const { result } = renderHook(() => useAskRepo({ ask }));

        let first;
        await act(async () => { first = result.current.send(null, 'all', 'One?'); });
        await act(async () => { result.current.send(first, 'all', 'Two?'); });
        let second;
        await act(async () => { second = result.current.send(null, 'all', 'Three?'); });

        expect(result.current.getMessages(first).map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
        expect(result.current.conversations.map((c) => c.id)).toEqual([second, first]);
    });

    it('lands a reply in the conversation it was asked in', async () => {
        const { ask, calls } = deferredAsk();
        const { result } = renderHook(() => useAskRepo({ ask }));

        let first;
        act(() => { first = result.current.send(null, 'all', 'Slow one?'); });
        let second;
        act(() => { second = result.current.send(null, 'all', 'Another?'); });
        await act(async () => calls[0].resolve(ANSWER));

        expect(result.current.getMessages(first)).toHaveLength(2);
        expect(result.current.getMessages(second)).toHaveLength(1);
        expect(result.current.getRequest(second).status).toBe('loading');
    });

    it('flags a slow answer after a few seconds', async () => {
        vi.useFakeTimers();
        try {
            const { ask, calls } = deferredAsk();
            const { result } = renderHook(() => useAskRepo({ ask }));
            let id;
            act(() => { id = result.current.send(null, 'all', 'Q?'); });

            act(() => { vi.advanceTimersByTime(SLOW_AFTER_MS - 1); });
            expect(result.current.getRequest(id).slow).toBe(false);
            act(() => { vi.advanceTimersByTime(1); });
            expect(result.current.getRequest(id).slow).toBe(true);

            await act(async () => calls[0].resolve(ANSWER));
            expect(result.current.getRequest(id)).toEqual({ status: 'idle', slow: false, error: null });
        } finally {
            vi.useRealTimers();
        }
    });

    it('asks a static-mode question by its id, showing its text, and never flags it slow', async () => {
        vi.useFakeTimers();
        try {
            const { ask, calls } = deferredAsk();
            const { result } = renderHook(() => useAskRepo({ ask }));
            let id;
            act(() => { id = result.current.send(null, 'project-prior-auth', 'What made the drafts hard to review?', { questionId: 'prior-auth-draft-review' }); });

            expect(ask).toHaveBeenCalledWith(
                { question: 'What made the drafts hard to review?', project: 'project-prior-auth', questionId: 'prior-auth-draft-review' },
                { signal: expect.any(AbortSignal) },
            );
            expect(result.current.conversations[0]).toMatchObject({ title: 'What made the drafts hard to review?', project: 'project-prior-auth' });
            expect(result.current.getMessages(id)).toEqual([expect.objectContaining({ role: 'user', content: 'What made the drafts hard to review?' })]);

            act(() => { vi.advanceTimersByTime(SLOW_AFTER_MS * 2); });
            expect(result.current.getRequest(id)).toEqual({ status: 'loading', slow: false, error: null });

            await act(async () => calls[0].resolve(ANSWER));
            expect(latestAssistantMessage(result.current.getMessages(id))).toMatchObject({ content: ANSWER.answer, sources: [SOURCE] });
        } finally {
            vi.useRealTimers();
        }
    });

    it('retries a failed static-mode question by its id', async () => {
        const ask = vi.fn().mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(ANSWER);
        const { result } = renderHook(() => useAskRepo({ ask }));

        let id;
        await act(async () => { id = result.current.send(null, 'all', 'Q?', { questionId: 'q-1' }); });
        expect(result.current.getRequest(id).error).toEqual({ kind: 'unknown', question: 'Q?', project: 'all', questionId: 'q-1' });
        await act(async () => { result.current.retry(id); });

        expect(ask).toHaveBeenLastCalledWith({ question: 'Q?', project: 'all', questionId: 'q-1' }, expect.anything());
        expect(result.current.getMessages(id).map((m) => m.role)).toEqual(['user', 'assistant']);
    });

    it.each([
        [401, 'session', 'Your session has ended.'],
        [502, 'model', "Couldn't get an answer."],
        [500, 'unknown', 'Something went wrong getting an answer.'],
    ])('records a %i as a %s error, keeping the question', async (status, kind, title) => {
        const ask = vi.fn().mockRejectedValue(httpError(status));
        const { result } = renderHook(() => useAskRepo({ ask }));

        let id;
        await act(async () => { id = result.current.send(null, 'project-him', 'Q?'); });

        expect(result.current.getRequest(id)).toEqual({ status: 'error', slow: false, error: { kind, question: 'Q?', project: 'project-him' } });
        expect(result.current.getMessages(id)).toEqual([expect.objectContaining({ role: 'user', content: 'Q?' })]);
        expect(result.current.announcement).toContain(title);
        expect(result.current.unavailable).toBe(false);
    });

    it('treats a network failure (no status) as unknown', async () => {
        const ask = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const { result } = renderHook(() => useAskRepo({ ask }));

        let id;
        await act(async () => { id = result.current.send(null, 'all', 'Q?'); });

        expect(result.current.getRequest(id).error.kind).toBe('unknown');
    });

    it('switches to unavailable on a 503, without an error in the thread', async () => {
        const ask = vi.fn().mockRejectedValue(httpError(503));
        const { result } = renderHook(() => useAskRepo({ ask }));

        let id;
        await act(async () => { id = result.current.send(null, 'all', 'Q?'); });

        expect(result.current.unavailable).toBe(true);
        expect(result.current.getRequest(id).status).toBe('idle');
        expect(result.current.getMessages(id)).toHaveLength(1);
        expect(result.current.announcement).toContain("Ask the Repo isn't available here.");
    });

    it('retries the failed question with its original project, without repeating it in the thread', async () => {
        const ask = vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValueOnce(ANSWER);
        const { result } = renderHook(() => useAskRepo({ ask }));

        let id;
        await act(async () => { id = result.current.send(null, 'project-him', 'Q?'); });
        await act(async () => { result.current.retry(id); });

        expect(ask).toHaveBeenLastCalledWith({ question: 'Q?', project: 'project-him' }, expect.anything());
        expect(result.current.getMessages(id).map((m) => m.role)).toEqual(['user', 'assistant']);
        expect(result.current.getRequest(id).status).toBe('idle');
    });

    it('aborts in-flight requests on unmount and ignores their outcome', async () => {
        const { ask, calls } = deferredAsk();
        const { result, unmount } = renderHook(() => useAskRepo({ ask }));
        act(() => { result.current.send(null, 'all', 'Q?'); });

        unmount();

        expect(calls[0].signal.aborted).toBe(true);
        // What fetch does on abort; must not throw or update unmounted state.
        await act(async () => calls[0].reject(new DOMException('Aborted', 'AbortError')));
    });

    it('changes the announcement even when the text repeats', async () => {
        const ask = vi.fn().mockResolvedValue(ANSWER);
        const { result } = renderHook(() => useAskRepo({ ask }));

        await act(async () => { result.current.send(null, 'all', 'One?'); });
        const first = result.current.announcement;
        await act(async () => { result.current.send(null, 'all', 'Two?'); });

        await waitFor(() => expect(result.current.announcement).not.toBe(first));
        expect(result.current.announcement.trim()).toBe(first.trim());
    });
});

describe('titleFrom', () => {
    it('keeps a short question whole', () => {
        expect(titleFrom('  How  did coders react? ')).toBe('How did coders react?');
    });

    it('cuts a long one on a word boundary', () => {
        const title = titleFrom('What did the prior auth usability tests find about outdated diagnosis codes in drafts?');
        expect(title).toBe('What did the prior auth usability tests find about outdated…');
        expect(title.length).toBeLessThanOrEqual(61);
    });
});

describe('previewFrom', () => {
    it('is the first line without citation markers', () => {
        expect(previewFrom('Coders worried about upcoding [1][2].\n\nMore.')).toBe('Coders worried about upcoding.');
    });
});
