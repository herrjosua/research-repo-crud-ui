import { useEffect, useRef, useState } from 'react';
import { Button, InlineLoading, InlineNotification } from '@carbon/react';
import ChatMessage from './ChatMessage';
import Composer from './Composer';
import StarterQuestions from './StarterQuestions';
import { ERROR_COPY, LOADING_TEXT, SLOW_TEXT, UNAVAILABLE_COPY } from './askCopy';
import styles from './ChatPanel.module.scss';

/**
 * The Ask the Repo chat surface: the open conversation's messages (or the
 * starter-question empty state), the request's loading or error state
 * after them, and the composer pinned below. Presentational: asking,
 * conversations and request state all live in `useAskRepo`
 * (`./useAskRepo.js`), owned by `AskTheRepo.jsx`, which passes the active
 * conversation's slice of it down here.
 *
 * - `messages`, `starters` (question strings; may be empty).
 * - `status` (`'idle' | 'loading' | 'error'`), `slow` (the answer is
 *   taking long enough to explain why), `error` (`{ kind, question }` when
 *   `status` is `'error'`; `kind` keys `./askCopy.js`'s `ERROR_COPY`).
 * - `unavailable`: the server has no language model. Shows the "not
 *   available here" notice and disables the composer and starters.
 * - `announcement`: text for the polite live region (new answers and
 *   errors), from `useAskRepo`.
 * - `onSend(text)`, `onRetry()`, `onSignIn()`, `onOpenSource(source,
 *   event)` (an inline citation was clicked).
 *
 * Local state is only what nothing else reads: the composer's text and
 * which replies are toggled "Save as deliverable" (a preview).
 *
 * This panel's height comes entirely from `.panel`'s own `block-size:
 * 100%` (ChatPanel.module.scss) resolving against the real, non-auto
 * height the CSS chain in AskTheRepo.jsx/.scss gives its Column.
 */
export default function ChatPanel({
    messages,
    starters = [],
    status = 'idle',
    slow = false,
    error = null,
    unavailable = false,
    announcement = '',
    onSend,
    onRetry,
    onSignIn,
    onOpenSource,
}) {
    const [input, setInput] = useState('');
    const [savedMessageIds, setSavedMessageIds] = useState(() => new Set());
    // The error whose question was last put back in the composer, so each
    // failure restores it once (see below).
    const [restoredError, setRestoredError] = useState(null);
    const composerRef = useRef(null);
    const bottomRef = useRef(null);

    const loading = status === 'loading';
    const errorCopy = status === 'error' && error ? ERROR_COPY[error.kind] ?? ERROR_COPY.unknown : null;

    // A failed question that can simply be asked again goes back into the
    // composer, so the user can edit or resend it. Adjusted during render
    // (React's pattern for state derived from a changed prop) rather than
    // in an effect, once per error.
    if (error !== restoredError) {
        setRestoredError(error);
        if (errorCopy?.retry) setInput(error.question);
    }

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, status, unavailable]);

    function handleSend() {
        const text = input.trim();
        if (!text || loading || unavailable) return;
        onSend(text);
        setInput('');
    }

    function handleRetry() {
        setInput('');
        onRetry();
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

    // First thing in an empty conversation (config said so up front); after
    // the thread, where the user is looking, when a question just got a 503.
    const unavailableNotice = unavailable && (
        <InlineNotification
            kind="info"
            title={UNAVAILABLE_COPY.title}
            subtitle={UNAVAILABLE_COPY.subtitle}
            lowContrast
            hideCloseButton
            className={styles.notification}
        />
    );

    return (
        <div className={styles.panel}>
            {/* Focusable so the thread can be scrolled from the keyboard even
                when nothing inside it is focusable (starters disabled while
                loading or unavailable) — axe's scrollable-region-focusable. */}
            <div className={styles.messages} role="region" aria-label="Conversation" tabIndex={0}>
                {messages.length === 0 && unavailableNotice}
                {messages.length === 0 ? (
                    starters.length > 0 && (
                        <StarterQuestions
                            questions={starters}
                            onSelect={handleSelectStarter}
                            disabled={loading || unavailable}
                        />
                    )
                ) : (
                    messages.map((message) => (
                        <ChatMessage
                            key={message.id}
                            message={message}
                            saved={savedMessageIds.has(message.id)}
                            onToggleSave={() => handleToggleSave(message.id)}
                            onOpenSource={onOpenSource}
                        />
                    ))
                )}
                {loading && (
                    // One polite region for both lines, so the slow-answer
                    // line is read out when it appears; InlineLoading's own
                    // (assertive by default) region is turned off.
                    <div className={styles.loading} aria-live="polite">
                        <InlineLoading description={LOADING_TEXT} aria-live="off" />
                        {slow && <p className={styles.slow}>{SLOW_TEXT}</p>}
                    </div>
                )}
                {errorCopy && (
                    <div className={styles.requestError}>
                        <InlineNotification
                            kind="error"
                            title={errorCopy.title}
                            subtitle={errorCopy.subtitle}
                            lowContrast
                            hideCloseButton
                            className={styles.notification}
                        />
                        {errorCopy.retry && (
                            <Button kind="tertiary" size="sm" onClick={handleRetry}>Try again</Button>
                        )}
                        {error.kind === 'session' && (
                            <Button kind="tertiary" size="sm" onClick={() => onSignIn()}>Sign in again</Button>
                        )}
                    </div>
                )}
                {messages.length > 0 && unavailableNotice}
                <div ref={bottomRef} />
            </div>
            <Composer
                ref={composerRef}
                value={input}
                onChange={setInput}
                onSend={handleSend}
                sending={loading}
                disabled={unavailable}
            />
            <p className="cds--visually-hidden" aria-live="polite">{announcement}</p>
        </div>
    );
}
