import { useRef, useState } from 'react';
import { Information } from '@carbon/icons-react';
import SourceCard from './SourceCard';
import SourceDetailModal from './SourceDetailModal';
import styles from './SourcesPanel.module.scss';

function toggleIn(set, id) {
    const next = new Set(set);
    if (next.has(id)) {
        next.delete(id);
    } else {
        next.add(id);
    }
    return next;
}

/**
 * Right rail of the Ask the Repo chat surface: the sources cited by the
 * chat panel's active assistant message (`AskTheRepo.jsx` derives which
 * one via `latestAssistantMessage`), as `SourceCard`s, plus the
 * `SourceDetailModal` a card opens into. Reimplements the right rail of
 * the Direction B v2 reference's `AskView.tsx` on Carbon/SCSS, scoped to
 * this ticket: no kind-filter chips, no project stats footer, no collapse
 * toggle.
 *
 * Owns the session-only UI state nothing outside the rail reads: which
 * source's modal is open, which source was opened last (the card's
 * "selected" state — kept after the modal closes, so the card focus
 * returns to is also the one highlighted), and which sources are pinned.
 * Which sources are *saved as insights* is not local: the Saved Insights
 * tab reads it too, so it lives in `useSavedInsights`
 * (`../insights/useSavedInsights.js`), lifted to `AskTheRepo.jsx` in
 * Story 6, and arrives here as `savedSourceIds` / `onToggleSaveSource`.
 * Neither pins nor insights persist until v1.3.7 — the footer note and the
 * modal's notification say so.
 *
 * `message`: the active assistant message (`../mock/messages.js`'s
 * message shape), or `null` when the conversation has no reply yet.
 * `savedSourceIds` (`Set` of source ids saved as insights),
 * `onToggleSaveSource(source)`.
 */
export default function SourcesPanel({ message, savedSourceIds, onToggleSaveSource }) {
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedSourceId, setSelectedSourceId] = useState(null);
    const [pinnedIds, setPinnedIds] = useState(() => new Set());
    const launcherRef = useRef(null);

    const sources = message?.sources ?? [];
    // Looked up in the current list, so switching to a message that
    // doesn't cite the last-opened source simply clears the highlight.
    const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;

    function handleOpen(source, event) {
        launcherRef.current = event.currentTarget;
        setSelectedSourceId(source.id);
        setModalOpen(true);
    }

    return (
        <aside className={styles.panel} aria-label="Sources">
            <div className={styles.header}>
                <h2 className={styles.heading}>Sources</h2>
                <span className={styles.count}>{sources.length}</span>
            </div>

            <div className={styles.body}>
                {sources.length === 0 ? (
                    <p className={styles.empty}>Sources will appear here as the conversation references them.</p>
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
                                    selected={source.id === selectedSource?.id}
                                    onOpen={(event) => handleOpen(source, event)}
                                    pinned={pinnedIds.has(source.id)}
                                    onTogglePin={() => setPinnedIds((prev) => toggleIn(prev, source.id))}
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

            <SourceDetailModal
                open={modalOpen && selectedSource !== null}
                source={selectedSource}
                onClose={() => setModalOpen(false)}
                pinned={selectedSource ? pinnedIds.has(selectedSource.id) : false}
                onTogglePin={() => setPinnedIds((prev) => toggleIn(prev, selectedSource.id))}
                saved={selectedSource ? savedSourceIds.has(selectedSource.id) : false}
                onToggleSave={() => onToggleSaveSource(selectedSource)}
                launcherButtonRef={launcherRef}
            />
        </aside>
    );
}
