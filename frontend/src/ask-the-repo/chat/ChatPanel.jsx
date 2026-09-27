import { useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import Composer from './Composer';
import StarterQuestions from './StarterQuestions';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';
import { STARTERS } from '../mock/starters';
import styles from './ChatPanel.module.scss';

function timestampNow() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Real LLM responses are a separate ticket — this stands in for one, in
// INITIAL_MESSAGES's own shape, so swapping a real call in later only
// means replacing this function's body with the actual request.
function mockReplyTo(projectId) {
    return {
        id: `m-${Date.now()}`,
        role: 'assistant',
        content: `This is a mock reply scoped to the **${projectId}** project — real answers are a separate ticket. In the meantime, this shows the assistant message layout: **bold** emphasis, and the "Save as deliverable" action below.`,
        timestamp: timestampNow(),
    };
}

// Bucket key for "no conversation selected yet" — mirrors AskView.tsx's
// own per-conversation `Record<string, Message[]>` (`convMessages`), just
// with an explicit string instead of `null` so a plain object works as
// the lookup table without a special-cased branch for the empty case.
const DRAFT_KEY = '__draft__';

/**
 * The Ask the Repo chat surface: message list (or the starter-question
 * empty state, when the active conversation has none yet) plus the
 * composer pinned below it. Reimplements
 * `docs/Build_Direction_B_v2_Design_decomposed`'s `AskView.tsx` chat
 * column on Carbon/SCSS, scoped to what this ticket covers — no
 * project-home view, no right-rail source panel, no real backend call
 * (all separate tickets).
 *
 * `projectId`/`conversationId`: the state `AskTheRepo.jsx` already lifted
 * in Story 3 (left rail). This component adds its own *new* state on top
 * — the actual messages, the composer's text, whether a reply is
 * pending, and which messages have been toggled "saved" — none of which
 * existed before this ticket and none of which anything outside this
 * panel currently needs to read.
 *
 * This panel's height comes entirely from `.panel`'s own `block-size:
 * 100%` (ChatPanel.module.scss) resolving against the real, non-auto
 * height the CSS chain in AskTheRepo.jsx/.scss now gives its Column —
 * no measurement prop needed.
 */
export default function ChatPanel({ projectId, conversationId }) {
    const [messagesByKey, setMessagesByKey] = useState(INITIAL_MESSAGES_BY_CONVERSATION);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [savedMessageIds, setSavedMessageIds] = useState(() => new Set());
    const composerRef = useRef(null);
    const bottomRef = useRef(null);
    const replyTimeoutRef = useRef(null);

    const key = conversationId ?? DRAFT_KEY;
    const messages = messagesByKey[key] ?? [];
    // Falls back to `all`'s starters for any project id without its own
    // entry — the defensive lookup the reference was missing (one of the
    // two pre-existing bugs this ticket calls out to fix: AskView.tsx
    // indexes a couple of these Records with a possibly-null project id
    // and no fallback).
    const starters = STARTERS[projectId] ?? STARTERS.all;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    // A reply can still be in flight when the user navigates away from
    // Ask the Repo entirely (App.jsx unmounts it — Carbon's Tabs, by
    // contrast, keeps inactive TabPanels mounted, so switching tabs alone
    // doesn't hit this). Without this, the pending setTimeout would call
    // setState on an unmounted component.
    useEffect(() => () => clearTimeout(replyTimeoutRef.current), []);

    function handleSend() {
        const text = input.trim();
        if (!text || sending) return;

        const userMessage = { id: `m-${Date.now()}`, role: 'user', content: text, timestamp: timestampNow() };
        setMessagesByKey((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), userMessage] }));
        setInput('');
        setSending(true);

        replyTimeoutRef.current = setTimeout(() => {
            setMessagesByKey((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), mockReplyTo(projectId)] }));
            setSending(false);
        }, 900);
    }

    function handleSelectStarter(question) {
        setInput(question);
        composerRef.current?.focus();
    }

    function handleToggleSave(messageId) {
        setSavedMessageIds((prev) => {
            const next = new Set(prev);
            if (next.has(messageId)) {
                next.delete(messageId);
            } else {
                next.add(messageId);
            }
            return next;
        });
    }

    return (
        <div className={styles.panel}>
            <div className={styles.messages}>
                {messages.length === 0 ? (
                    <StarterQuestions questions={starters} onSelect={handleSelectStarter} />
                ) : (
                    messages.map((message) => (
                        <ChatMessage
                            key={message.id}
                            message={message}
                            saved={savedMessageIds.has(message.id)}
                            onToggleSave={() => handleToggleSave(message.id)}
                        />
                    ))
                )}
                {sending && <p className={styles.sendingIndicator}>Searching corpus…</p>}
                <div ref={bottomRef} />
            </div>
            <Composer ref={composerRef} value={input} onChange={setInput} onSend={handleSend} sending={sending} />
        </div>
    );
}
