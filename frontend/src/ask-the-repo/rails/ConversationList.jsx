import styles from './ConversationList.module.scss';

/**
 * Conversation history list for the Ask the Repo left rail. Renders
 * whatever list it's given — `LeftRail` filters this session's
 * conversations down to the active project before passing it in, so this
 * component stays a plain, order-preserving render.
 *
 * Clicking a conversation calls `onSelectConversation(id)`; `LeftRail`
 * wires that into the active-conversation state that the chat panel
 * reads to know which conversation to open — this component
 * only needs to report the click, not know what happens after.
 *
 * `conversations` (array of `{ id, title, project, lastMessage, time,
 * unread? }`, matching `CONVERSATIONS`'s shape), `activeConversationId`,
 * `onSelectConversation(id)`.
 */
export default function ConversationList({ conversations, activeConversationId, onSelectConversation }) {
    if (conversations.length === 0) {
        return <p className={styles.empty}>Questions you ask will appear here.</p>;
    }

    return (
        <ul className={styles.list}>
            {conversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                    <li key={conv.id}>
                        <button
                            type="button"
                            className={isActive ? `${styles.item} ${styles.active}` : styles.item}
                            aria-current={isActive ? 'true' : undefined}
                            onClick={() => onSelectConversation(conv.id)}
                        >
                            <span className={styles.row}>
                                <span className={styles.title}>
                                    {conv.unread && <span className={styles.unreadDot} aria-hidden="true" />}
                                    {conv.title}
                                </span>
                                <span className={styles.time}>{conv.time}</span>
                            </span>
                            <span className={styles.preview}>{conv.lastMessage}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
