import { Save, Checkmark } from '@carbon/icons-react';
import KindTag from '../sources/KindTag';
import styles from './AssistantMessage.module.scss';

// Splits on **bold** runs, same markup INITIAL_MESSAGES's content uses;
// mirrors AssistantMessage.tsx's own regex rather than pulling in a full
// markdown parser for one inline style.
function renderParagraph(text) {
    return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : part
    );
}

/**
 * Renders one assistant message's own content: body text (with **bold**
 * support), its cited sources (if any), and the "Save as deliverable"
 * affordance every assistant message needs per this ticket. Citation
 * click-through (opening a source, highlighting it) is out of scope here
 * — that's "citation attribution", called out in the ticket as v1.3.7
 * work — so sources render as a plain static list, not the reference's
 * clickable/`activeSource`-highlighted ones.
 *
 * Saving is a visual stub, not real persistence (also explicitly out of
 * scope this ticket): `saved`/`onToggleSave` just flip local state one
 * level up in `ChatPanel.jsx`, the same way `Dashboard.jsx` toggles its
 * own `Set`-backed filters — no record is actually created.
 *
 * `message` (a `Message` from `../mock/messages.js`'s shape: `{ id, role,
 * content, sources?, timestamp }`), `saved` (bool), `onToggleSave()`.
 */
export default function AssistantMessage({ message, saved, onToggleSave }) {
    const paragraphs = message.content.split('\n\n');

    return (
        <div className={styles.message}>
            <div className={styles.body}>
                {paragraphs.map((paragraph, i) => (
                    <p key={i}>{renderParagraph(paragraph)}</p>
                ))}
            </div>
            {message.sources?.length > 0 && (
                <div className={styles.sources}>
                    <p className={styles.sourcesLabel}>{message.sources.length} sources cited</p>
                    <ul className={styles.sourceList}>
                        {message.sources.map((source) => (
                            <li key={source.id} className={styles.sourceItem}>
                                <KindTag kind={source.kind} />
                                <span className={styles.sourceTitle}>{source.title}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <button
                type="button"
                className={saved ? `${styles.saveButton} ${styles.saved}` : styles.saveButton}
                onClick={() => onToggleSave()}
            >
                {saved ? <Checkmark size={14} /> : <Save size={14} />}
                {saved ? 'Saved as deliverable' : 'Save as deliverable'}
            </button>
        </div>
    );
}
