import { forwardRef } from 'react';
import { TextArea, IconButton } from '@carbon/react';
import { Send } from '@carbon/icons-react';
import styles from './Composer.module.scss';

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
 * (bool — disables the field and button while a mock reply is pending).
 * Forwards `ref` to the underlying `<textarea>` so `ChatPanel` can focus it
 * after a starter question fills the field.
 */
const Composer = forwardRef(function Composer({ value, onChange, onSend, sending }, ref) {
    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
        }
    }

    const canSend = value.trim().length > 0 && !sending;

    return (
        <div className={styles.composer}>
            <TextArea
                ref={ref}
                id="ask-the-repo-composer"
                labelText="Ask a question about the research"
                hideLabel
                placeholder="Ask a question about the research…"
                rows={2}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
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
