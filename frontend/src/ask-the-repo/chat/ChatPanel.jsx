import { useEffect, useRef, useState } from 'react';
import { Button, InlineLoading, InlineNotification } from '@carbon/react';
import ChatMessage from './ChatMessage';
import Composer from './Composer';
import QuestionPicker from './QuestionPicker';
import StarterQuestions from './StarterQuestions';
import { ERROR_COPY, LOADING_TEXT, NO_PICKER_QUESTIONS, NO_STARTERS, PICKER_LABEL, SLOW_TEXT, UNAVAILABLE_COPY } from './askCopy';
import styles from './ChatPanel.module.scss';

/**
 * The Ask the Repo chat surface: the open conversation's messages (or the
 * starter-question empty state), the request's loading or error state
 * after them, and the composer pinned below. Presentational: asking,
 * conversations and request state all live in `useAskRepo`
 * (`./useAskRepo.js`), owned by `AskTheRepo.jsx`, which passes the active
 * conversation's slice of it down here.
 *
 * - `messages`, `starters` (question strings; may be empty, which shows
 *   a line pointing to the composer instead).
 * - `status` (`'idle' | 'loading' | 'error'`), `slow` (the answer is
 *   taking long enough to explain why), `error` (`{ kind, question }` when
 *   `status` is `'error'`; `kind` keys `./askCopy.js`'s `ERROR_COPY`).
 * - `unavailable`: the server has no language model. Shows the "not
 *   available here" notice, disables the composer, and leaves out the
 *   starters, which could only fill a composer that can't send.
 * - `announcement`: text for the polite live region (new answers and
 *   errors), from `useAskRepo`.
 * - `pickerQuestions`: static mode (the public demo) when set, an array of
 *   `{ id, question, project }` already filtered to the active project;
 *   `null` (live mode) otherwise. Nothing can be typed: the empty state
 *   lists the questions in the starter-question look, and once a
 *   conversation has started a `QuestionPicker` dropdown takes the
 *   composer's place. Either way, picking one calls `onPickQuestion`
 *   straight away, and `pickerNote` (where the answers came from) sits
 *   under the picker. An empty array says the project has none yet
 *   (a safety net: AskTheRepo only lists projects that have some).
 * - `onSend(text)`, `onRetry()`, `onSignIn()`, `onOpenSource(source,
 *   event)` (an inline citation was clicked), `onPickQuestion(question)`.
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
    pickerQuestions = null,
    pickerNote = '',
    onSend,
    onRetry,
    onSignIn,
    onOpenSource,
    onPickQuestion,
}) {
    const [input, setInput] = useState('');
    const [savedMessageIds, setSavedMessageIds] = useState(() => new Set());
    // The error whose question was last put back in the composer, so each
    // failure restores it once (see below).
    const [restoredError, setRestoredError] = useState(null);
    const composerRef = useRef(null);
    const bottomRef = useRef(null);

    const loading = status === 'loading';
    // A 503 still wins: with no answers to give, the usual notice and
    // disabled composer show instead.
    const picking = pickerQuestions !== null && !unavailable;
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

    // `question` is the picked `{ id, question, project }` itself, so two
    // questions with the same wording still send their own ids.
    function handlePickStarter(question) {
        if (!loading) onPickQuestion(question);
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
                when nothing inside it is focusable (an empty conversation
                while unavailable has no starters) — axe's
                scrollable-region-focusable. */}
            <div className={styles.messages} role="region" aria-label="Conversation" tabIndex={0}>
                {messages.length === 0 && unavailableNotice}
                {messages.length === 0 && picking && (
                    <div className={styles.pickerEmpty}>
                        {pickerQuestions.length > 0 ? (
                            <StarterQuestions
                                label={PICKER_LABEL}
                                questions={pickerQuestions}
                                onSelect={handlePickStarter}
                            />
                        ) : (
                            <p className={styles.pickerNone}>{NO_PICKER_QUESTIONS}</p>
                        )}
                        {pickerNote && <p className={styles.pickerNote}>{pickerNote}</p>}
                    </div>
                )}
                {messages.length === 0 ? (
                    !unavailable && !picking && (
                        starters.length > 0 ? (
                            <StarterQuestions questions={starters} onSelect={handleSelectStarter} />
                        ) : (
                            <p className={styles.pickerNone}>{NO_STARTERS}</p>
                        )
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
            {!picking ? (
                <Composer
                    ref={composerRef}
                    value={input}
                    onChange={setInput}
                    onSend={handleSend}
                    sending={loading}
                    disabled={unavailable}
                />
            ) : messages.length > 0 && (
                <QuestionPicker
                    questions={pickerQuestions}
                    disabled={loading}
                    note={pickerNote}
                    onPick={onPickQuestion}
                />
            )}
            <p className="cds--visually-hidden" aria-live="polite">{announcement}</p>
        </div>
    );
}
