import { Bot } from '@carbon/icons-react';
import AssistantMessage from './AssistantMessage';
import styles from './ChatMessage.module.scss';

/**
 * One row in the message list (see `ChatPanel.jsx`): a right-aligned
 * bubble for the user's own messages, or the assistant's avatar/label
 * header plus its rendered content for everything else. Reimplements
 * `docs/Build_Direction_B_v2_Design_decomposed`'s `ChatMessage.tsx` on
 * Carbon/SCSS — `AssistantMessage` (this folder) does the assistant
 * content itself; this component only decides which branch to render and
 * draws the shared header/bubble chrome around it.
 *
 * `message` (a `Message` from `../fixtures/messages.js`'s shape), `saved`/
 * `onToggleSave()` — passed straight through to `AssistantMessage` for
 * user messages, which have nothing to save, `saved`/`onToggleSave` are
 * simply unused. `onOpenSource(source, event)`: an inline citation was
 * clicked (see `AssistantMessage`).
 */
export default function ChatMessage({ message, saved, onToggleSave, onOpenSource }) {
    if (message.role === 'user') {
        return (
            <div className={styles.userRow}>
                <div className={styles.userBubble}>{message.content}</div>
                <span className={styles.timestamp}>{message.timestamp}</span>
            </div>
        );
    }

    return (
        <div className={styles.assistantRow}>
            <div className={styles.assistantHeader}>
                <span className={styles.avatar}>
                    <Bot size={14} />
                </span>
                <span className={styles.assistantLabel}>Ask the Repo</span>
                <span className={styles.timestamp}>{message.timestamp}</span>
            </div>
            <AssistantMessage message={message} saved={saved} onToggleSave={onToggleSave} onOpenSource={onOpenSource} />
        </div>
    );
}
