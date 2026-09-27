import { useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import Composer from './Composer';
import StarterQuestions from './StarterQuestions';
import { STARTERS } from '../mock/starters';
import styles from './ChatPanel.module.scss';

function timestampNow() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Real LLM responses are a separate ticket — this stands in for one, in
// INITIAL_MESSAGES's own shape, so swapping a real call in later only
// means replacing this function's body with the actual request. Carries
// one cited source (the same one AskView.tsx's mock reply cites) so the
// sources rail visibly switches to each new reply as it lands.
function mockReplyTo(projectId) {
    const now = Date.now();
    return {
        id: `m-${now}`,
        role: 'assistant',
        content: `This is a mock reply scoped to the **${projectId}** project — real answers are a separate ticket. In the meantime, this shows the assistant message layout: **bold** emphasis, and the "Save as deliverable" action below.`,
        sources: [
            {
                id: `rs-${now}`,
                kind: 'doc',
                title: 'Research Plan — Checkout Q3',
                excerpt: 'Primary goal: identify top 3 friction points preventing task completion in the purchase funnel.',
                project: 'Checkout Redesign',
                date: 'Jul 28, 2026',
                page: 2,
                contextBefore: 'This plan covers the Q3 checkout research program: a moderated usability study (two waves), a post-purchase survey, and a review of funnel analytics. Stakeholders from Payments, Growth, and Design signed off on scope at kickoff.',
                contextAfter: 'Secondary goals are to benchmark checkout completion time against the Q1 baseline and to validate whether guest checkout reduces first-visit abandonment. Methods and recruiting criteria follow in section 2.',
            },
        ],
        timestamp: timestampNow(),
    };
}

/**
 * The Ask the Repo chat surface: message list (or the starter-question
 * empty state, when the active conversation has none yet) plus the
 * composer pinned below it. Reimplements
 * `docs/Build_Direction_B_v2_Design_decomposed`'s `AskView.tsx` chat
 * column on Carbon/SCSS — no project-home view and no real backend call
 * (separate tickets). The right-rail source panel is a sibling component
 * (`../sources/SourcesPanel.jsx`), not part of this one.
 *
 * `projectId`/`conversationId`: the state `AskTheRepo.jsx` already lifted
 * in Story 3 (left rail).
 *
 * `messages` / `onAppendMessage(conversationId, message)`: the active
 * conversation's messages and the way to add one, from
 * `useConversationMessages` (`./useConversationMessages.js`) — lifted out
 * of this component in Story 5 because the sources rail now reads the
 * same messages. The composer's text, whether a reply is pending, and
 * which messages are toggled "saved" stay local: nothing outside this
 * panel reads those.
 *
 * This panel's height comes entirely from `.panel`'s own `block-size:
 * 100%` (ChatPanel.module.scss) resolving against the real, non-auto
 * height the CSS chain in AskTheRepo.jsx/.scss now gives its Column —
 * no measurement prop needed.
 */
export default function ChatPanel({ projectId, conversationId, messages, onAppendMessage }) {
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [savedMessageIds, setSavedMessageIds] = useState(() => new Set());
    const composerRef = useRef(null);
    const bottomRef = useRef(null);
    const replyTimeoutRef = useRef(null);

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

        // Captured now, not read inside the timeout: the reply belongs to
        // the conversation it was asked in, even if the user has opened a
        // different one by the time it lands.
        const askedIn = conversationId;
        const userMessage = { id: `m-${Date.now()}`, role: 'user', content: text, timestamp: timestampNow() };
        onAppendMessage(askedIn, userMessage);
        setInput('');
        setSending(true);

        replyTimeoutRef.current = setTimeout(() => {
            onAppendMessage(askedIn, mockReplyTo(projectId));
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
