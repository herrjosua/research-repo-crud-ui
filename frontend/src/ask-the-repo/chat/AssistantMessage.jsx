import { UnorderedList, ListItem } from '@carbon/react';
import { Save, Checkmark, Information } from '@carbon/icons-react';
import KindTag from '../sources/KindTag';
import styles from './AssistantMessage.module.scss';

const LIST_ITEM = /^\s*-\s+(.*)$/;
const CITATION = /(\[\d+\])/;

// One paragraph of the answer as blocks: runs of "- " lines become a list,
// every other run of lines a text block that keeps its line breaks. The
// backend's answers are plain text (no markdown), so this is the only
// structure there is to render.
function blocksOf(paragraph) {
    const blocks = [];
    for (const line of paragraph.split('\n')) {
        const item = LIST_ITEM.exec(line);
        const last = blocks.at(-1);
        if (item) {
            if (last?.type === 'list') last.items.push(item[1]);
            else blocks.push({ type: 'list', items: [item[1]] });
        } else if (last?.type === 'text') {
            last.lines.push(line);
        } else {
            blocks.push({ type: 'text', lines: [line] });
        }
    }
    return blocks;
}

// Text with each "[n]" marker that points at a cited source turned into a
// button opening that source. A number with no source (which the backend
// never sends, but model text is untrusted) stays plain text.
function renderInline(text, sources, onOpenSource) {
    return text.split(CITATION).map((part, i) => {
        const number = /^\[(\d+)\]$/.exec(part)?.[1];
        const source = number && sources[Number(number) - 1];
        if (!source) return part;
        return (
            <button
                key={i}
                type="button"
                className={styles.citation}
                aria-label={`Source ${number}: ${source.title}`}
                aria-haspopup="dialog"
                onClick={(event) => onOpenSource?.(source, event)}
            >
                {number}
            </button>
        );
    });
}

/**
 * Renders one assistant message's own content: the answer (plain text from
 * POST /api/ask, with clickable `[n]` citations), its cited sources as a
 * compact list, and the "Save as deliverable" preview.
 *
 * A citation opens the same source detail modal the sources rail's cards
 * do (`onOpenSource(source, event)`, owned by `AskTheRepo.jsx`), with this
 * message's own `sources` — so a marker in an older reply opens that
 * reply's source, not whatever the rail currently shows.
 *
 * Saving as a deliverable is a visual stub, not real persistence:
 * `saved`/`onToggleSave` just flip local state in `ChatPanel.jsx`, and the
 * note beside the button says nothing is stored, in the same words as the
 * pins and insights previews.
 *
 * `message` (`{ id, role, content, sources?, timestamp }`, see
 * `../fixtures/messages.js`), `saved` (bool), `onToggleSave()`,
 * `onOpenSource(source, event)`.
 */
export default function AssistantMessage({ message, saved, onToggleSave, onOpenSource }) {
    const sources = message.sources ?? [];
    const paragraphs = message.content.split('\n\n');

    return (
        <div className={styles.message}>
            <div className={styles.body}>
                {paragraphs.flatMap((paragraph, i) => blocksOf(paragraph).map((block, j) => (
                    block.type === 'list' ? (
                        <UnorderedList key={`${i}-${j}`} className={styles.list}>
                            {block.items.map((item, k) => (
                                <ListItem key={k}>{renderInline(item, sources, onOpenSource)}</ListItem>
                            ))}
                        </UnorderedList>
                    ) : (
                        <p key={`${i}-${j}`}>
                            {block.lines.map((line, k) => (
                                <span key={k}>
                                    {k > 0 && <br />}
                                    {renderInline(line, sources, onOpenSource)}
                                </span>
                            ))}
                        </p>
                    )
                )))}
            </div>
            {sources.length > 0 ? (
                <div className={styles.sources}>
                    <p className={styles.sourcesLabel}>{sources.length} sources cited</p>
                    <ul className={styles.sourceList}>
                        {sources.map((source) => (
                            <li key={source.id} className={styles.sourceItem}>
                                <KindTag kind={source.kind} />
                                <span className={styles.sourceTitle}>{source.title}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className={styles.noSources}>No records were cited for this answer.</p>
            )}
            <div className={styles.actions}>
                <button
                    type="button"
                    className={saved ? `${styles.saveButton} ${styles.saved}` : styles.saveButton}
                    onClick={() => onToggleSave()}
                >
                    {saved ? <Checkmark size={14} /> : <Save size={14} />}
                    {saved ? 'Saved as deliverable' : 'Save as deliverable'}
                </button>
                <p className={styles.previewNote}>
                    <Information size={16} aria-hidden="true" className={styles.previewIcon} />
                    Deliverables are a preview — nothing is stored yet.
                </p>
            </div>
        </div>
    );
}
