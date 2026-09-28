import { Information } from '@carbon/icons-react';
import SourceCard from './SourceCard';
import styles from './SourcesPanel.module.scss';

/**
 * Right rail of the Ask the Repo chat surface: the sources cited by the
 * chat panel's active assistant message (`AskTheRepo.jsx` derives which
 * one via `latestAssistantMessage`), as `SourceCard`s. Reimplements the
 * right rail of the Direction B v2 reference's `AskView.tsx` on
 * Carbon/SCSS, scoped down: no kind-filter chips, no project stats footer,
 * no collapse toggle.
 *
 * Controlled: the source detail modal a card opens, which source was
 * opened last (the card's "selected" state, kept after the modal closes so
 * the card focus returns to is also the one highlighted) and which sources
 * are pinned all live in `AskTheRepo.jsx`, because an answer's inline
 * citations open the same modal. Neither pins nor insights persist until
 * v1.3.7 — the footer note and the modal's notification say so.
 *
 * `message`: the active assistant message (see `../fixtures/messages.js`),
 * or `null` when the conversation has no reply yet. `selectedSourceId`,
 * `onOpenSource(source, event)`, `pinnedIds` (`Set` of source ids),
 * `onTogglePin(source)`, `projectLabelFor(recordProject)` (display name of
 * a project tag, or null).
 */
export default function SourcesPanel({
    message,
    selectedSourceId = null,
    onOpenSource,
    pinnedIds = new Set(),
    onTogglePin,
    projectLabelFor = () => null,
}) {
    const sources = message?.sources ?? [];

    let empty = null;
    if (!message) empty = 'Sources will appear here as the conversation references them.';
    else if (sources.length === 0) empty = "This reply didn't cite any sources.";

    return (
        <aside className={styles.panel} aria-label="Sources">
            <div className={styles.header}>
                <h2 className={styles.heading}>Sources</h2>
                <span className={styles.count}>{sources.length}</span>
            </div>

            <div className={styles.body}>
                {empty ? (
                    <p className={styles.empty}>{empty}</p>
                ) : (
                    <>
                    {/* In the scrolling body, not the header: the header
                        stays one fixed-height row (lined up with
                        LeftRail's) even at the md floor, where this line
                        wraps. */}
                    <p className={styles.context}>Cited in reply · {message.timestamp}</p>
                    <ul className={styles.list}>
                        {sources.map((source) => (
                            <li key={source.id}>
                                <SourceCard
                                    source={source}
                                    projectLabel={projectLabelFor(source.recordProject)}
                                    selected={source.id === selectedSourceId}
                                    onOpen={(event) => onOpenSource(source, event)}
                                    pinned={pinnedIds.has(source.id)}
                                    onTogglePin={() => onTogglePin(source)}
                                />
                            </li>
                        ))}
                    </ul>
                    </>
                )}
            </div>

            {sources.length > 0 && (
                <p className={styles.footer}>
                    <Information size={16} aria-hidden="true" className={styles.footerIcon} />
                    Pins and saved insights are a preview — nothing is stored yet.
                </p>
            )}
        </aside>
    );
}
