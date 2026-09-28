import { forwardRef } from 'react';
import { TextArea, IconButton } from '@carbon/react';
import { Send } from '@carbon/icons-react';
import styles from './Composer.module.scss';

// POST /api/ask's own limit on a question's length.
export const MAX_QUESTION_CHARS = 2000;

/**
 * The chat input row: a textarea plus a send button, pinned below the
 * message list (see `ChatPanel.jsx`). Enter sends; Shift+Enter inserts a
 * newline, matching `docs/Build_Direction_B_v2_Design_decomposed`'s
 * `AskView.tsx` composer.
 *
 * The send button's `onClick` is `() => onSend()`, not `onClick={onSend}`
 * — that difference is the fix for one of the two reference bugs this
 * ticket calls out. Passing `onSend` directly hands the button's click
 * handler the browser's `MouseEvent` as its first argument; wrapping it
 * ensures `onSend` is always called with no arguments, regardless of what
 * triggered it.
 *
 * `value`/`onChange(value)` (controlled input text), `onSend()`, `sending`
 * (bool — disables the field and button while an answer is pending),
 * `disabled` (bool — asking isn't available at all). Forwards `ref` to the
 * underlying `<textarea>` so `ChatPanel` can focus it after a starter
 * question fills the field.
 *
 * `maxLength` matches POST /api/ask's 2000-character limit, so an
 * over-long question can't be typed rather than failing with a 400. The
 * helper text says each question is answered on its own, because the
 * endpoint has no memory of earlier ones: a follow-up like "and in v2?"
 * needs to name what it's about.
 */
const Composer = forwardRef(function Composer({ value, onChange, onSend, sending, disabled = false }, ref) {
    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
        }
    }

    const canSend = value.trim().length > 0 && !sending && !disabled;

    return (
        <div className={styles.composer}>
            <TextArea
                ref={ref}
                id="ask-the-repo-composer"
                labelText="Ask a question about the research"
                hideLabel
                placeholder="Ask a question about the research…"
                helperText="Each question is answered on its own, without earlier ones as context."
                rows={2}
                maxLength={MAX_QUESTION_CHARS}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending || disabled}
                className={styles.textarea}
            />
            <IconButton
                label="Send"
                kind="primary"
                disabled={!canSend}
                onClick={() => onSend()}
            >
                <Send size={16} />
            </IconButton>
        </div>
    );
});

export default Composer;
