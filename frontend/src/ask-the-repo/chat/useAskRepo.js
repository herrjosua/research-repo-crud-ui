import { useCallback, useEffect, useRef, useState } from 'react';
import { askRepo } from '../../api/ask';
import { ERROR_COPY, UNAVAILABLE_COPY } from './askCopy';

// After this long without an answer, ChatPanel adds the "first question can
// take up to 20 seconds" line (the backend embeds the corpus on the first
// question after a start).
export const SLOW_AFTER_MS = 5000;
const TITLE_MAX_CHARS = 60;

const IDLE = { status: 'idle', slow: false, error: null };

let nextId = 0;
function makeId(prefix) {
    nextId += 1;
    return `${prefix}-${Date.now()}-${nextId}`;
}

function timestampNow() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// A conversation's title: its first question, cut on a word boundary.
export function titleFrom(question) {
    const text = question.replace(/\s+/g, ' ').trim();
    if (text.length <= TITLE_MAX_CHARS) return text;
    const cut = text.slice(0, TITLE_MAX_CHARS);
    const space = cut.lastIndexOf(' ');
    return `${(space > 20 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

// A conversation's rail preview: the answer's first line, without its [n]
// citation markers (they mean nothing out of context).
export function previewFrom(answer) {
    return answer.split('\n')[0].replace(/\s*\[\d+\]/g, '').trim();
}

// POST /api/ask failures, by what the UI does about them. 503 isn't an
// error kind: it switches the whole tab to "not available" instead.
function errorKind(err) {
    if (err.status === 401) return 'session';
    if (err.status === 502) return 'model';
    return 'unknown';
}

function sourcesPhrase(count) {
    if (count === 0) return 'no sources cited';
    return `${count} source${count === 1 ? '' : 's'} cited`;
}

/**
 * Ask the Repo's conversations and the requests behind them. Owned by
 * `AskTheRepo.jsx`; `ChatPanel` only renders what this returns.
 *
 * Everything is session-only React state: conversations start empty and
 * are lost when the page unmounts, the same as saved insights.
 *
 * - `conversations`: `[{ id, title, project, lastMessage, time }]`, newest
 *   first. `project` is the project the conversation was started in
 *   (`'all'` or a project-* tag); every question in it uses that filter.
 * - `getMessages(id)` / `getRequest(id)`: a conversation's messages, and
 *   its in-flight request state `{ status: 'idle' | 'loading' | 'error',
 *   slow, error: { kind, question, project, questionId? } | null }`.
 * - `send(conversationId, project, question, { questionId })`: appends the
 *   question and asks it. With no `conversationId`, starts a new
 *   conversation. Returns the conversation's id. The reply lands in that
 *   conversation even if the user has opened another one in the meantime.
 *   `questionId` (static mode) asks a captured question by its id; the
 *   question text is still what the thread shows, and `slow` never turns
 *   on.
 * - `retry(conversationId)`: re-asks a failed question without adding the
 *   question to the thread a second time.
 * - `unavailable`: true once the server has answered 503 (no language
 *   model), which disables asking for the rest of the session.
 * - `announcement`: text for the chat's polite live region, set when an
 *   answer or error lands.
 *
 * In-flight requests are aborted when the page unmounts. `ask` is the
 * request function, injectable for tests.
 */
export function useAskRepo({ ask = askRepo } = {}) {
    const [conversations, setConversations] = useState([]);
    const [messagesById, setMessagesById] = useState({});
    const [requests, setRequests] = useState({});
    const [unavailable, setUnavailable] = useState(false);
    const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
    const controllers = useRef(new Set());
    const timers = useRef(new Set());

    useEffect(() => {
        const liveControllers = controllers.current;
        const liveTimers = timers.current;
        return () => {
            liveControllers.forEach((controller) => controller.abort());
            liveTimers.forEach((timer) => clearTimeout(timer));
        };
    }, []);

    const announce = useCallback((text) => {
        setAnnouncement((prev) => ({ text, count: prev.count + 1 }));
    }, []);

    const appendMessage = useCallback((conversationId, message) => {
        setMessagesById((prev) => ({ ...prev, [conversationId]: [...(prev[conversationId] ?? []), message] }));
    }, []);

    const setRequest = useCallback((conversationId, update) => {
        setRequests((prev) => {
            const next = typeof update === 'function' ? update(prev[conversationId] ?? IDLE) : update;
            return { ...prev, [conversationId]: next };
        });
    }, []);

    const request = useCallback(async (conversationId, question, project, questionId) => {
        const controller = new AbortController();
        controllers.current.add(controller);
        setRequest(conversationId, { status: 'loading', slow: false, error: null });
        // A captured answer (questionId) is read from a file, never indexed,
        // so it's never slow in the way the hint explains.
        const timer = questionId ? null : setTimeout(() => {
            setRequest(conversationId, (current) => (current.status === 'loading' ? { ...current, slow: true } : current));
        }, SLOW_AFTER_MS);
        if (timer) timers.current.add(timer);

        try {
            const body = questionId ? { question, project, questionId } : { question, project };
            const { answer, sources, model } = await ask(body, { signal: controller.signal });
            const time = timestampNow();
            appendMessage(conversationId, {
                id: makeId('m'),
                role: 'assistant',
                content: answer,
                sources: sources ?? [],
                model,
                timestamp: time,
            });
            setConversations((prev) => prev.map((conv) => (
                conv.id === conversationId ? { ...conv, lastMessage: previewFrom(answer), time } : conv
            )));
            setRequest(conversationId, IDLE);
            announce(`Answer received, ${sourcesPhrase(sources?.length ?? 0)}.`);
        } catch (err) {
            if (controller.signal.aborted) return;
            if (err.status === 503) {
                setUnavailable(true);
                setRequest(conversationId, IDLE);
                announce(`${UNAVAILABLE_COPY.title} ${UNAVAILABLE_COPY.subtitle}`);
                return;
            }
            const kind = errorKind(err);
            const error = questionId ? { kind, question, project, questionId } : { kind, question, project };
            setRequest(conversationId, { status: 'error', slow: false, error });
            announce(`${ERROR_COPY[kind].title} ${ERROR_COPY[kind].subtitle}`);
        } finally {
            clearTimeout(timer);
            timers.current.delete(timer);
            controllers.current.delete(controller);
        }
    }, [ask, announce, appendMessage, setRequest]);

    const send = useCallback((conversationId, project, question, { questionId } = {}) => {
        const text = question.trim();
        let id = conversationId;
        if (!id) {
            id = makeId('c');
            setConversations((prev) => [
                { id, title: titleFrom(text), project, lastMessage: '', time: timestampNow() },
                ...prev,
            ]);
        }
        appendMessage(id, { id: makeId('m'), role: 'user', content: text, timestamp: timestampNow() });
        request(id, text, project, questionId);
        return id;
    }, [appendMessage, request]);

    const retry = useCallback((conversationId) => {
        const error = requests[conversationId]?.error;
        if (error) request(conversationId, error.question, error.project, error.questionId);
    }, [requests, request]);

    const getMessages = useCallback((conversationId) => messagesById[conversationId] ?? [], [messagesById]);
    const getRequest = useCallback((conversationId) => requests[conversationId] ?? IDLE, [requests]);

    // A trailing no-break space on every other announcement, so the same
    // text twice in a row still changes the live region and is re-read.
    const announcementText = announcement.text + (announcement.count % 2 ? ' ' : '');

    return { conversations, getMessages, getRequest, send, retry, unavailable, announcement: announcementText };
}

/**
 * The assistant message whose sources the right rail shows: the latest
 * one in the conversation, matching AskView.tsx's `activeSources`. `null`
 * when the conversation has no assistant reply yet.
 */
export function latestAssistantMessage(messages) {
    return messages.findLast((message) => message.role === 'assistant') ?? null;
}
