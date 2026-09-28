import { Modal, Button, InlineNotification } from '@carbon/react';
import { Pin, PinFilled, Bookmark, BookmarkFilled } from '@carbon/icons-react';
import KindTag from './KindTag';
import { PINNABLE_KINDS } from './kindMeta';
import styles from './SourceDetailModal.module.scss';

// Spoken/verbatim kinds read as quotes, so their excerpt is italicized —
// same rule as the reference's SourceDetailModal.tsx.
const VERBATIM_KINDS = new Set(['interview', 'transcript']);

/**
 * Detail view for one cited source: kind tag, page/project/date, the
 * cited excerpt highlighted in place between the text that comes before
 * and after it in the original, plus "Pin as top finding" (primary-
 * evidence kinds only) and "Save as insight". Reimplements the Direction
 * B v2 reference's `SourceDetailModal.tsx` on Carbon — a centered
 * `Modal`, not the reference's bottom sheet — following
 * `RecordDetail.jsx`'s existing pattern: `passiveModal` (Carbon's own
 * close button and Esc/click-outside handling, no footer), tertiary
 * action buttons, and a `lowContrast` info notification to mark a
 * boundary ("Generated from Figma" there, "not saved yet" here).
 *
 * Pin/save are UI-only until v1.3.7: the toggles flip session state in
 * `AskTheRepo.jsx`, which owns this modal so both the sources rail's cards
 * and an answer's inline citations can open it, and the notification
 * states plainly that nothing is stored, rather than the buttons implying
 * persistence.
 *
 * `open` (bool), `source` (a POST /api/ask source, with
 * `contextBefore`/`contextAfter`; see `../fixtures/messages.js`),
 * `projectLabel` (display name of `source.recordProject`, or null),
 * `onClose()`, `pinned` / `onTogglePin()`,
 * `saved` / `onToggleSave()`, `launcherButtonRef` (passed through to
 * Carbon's `Modal`, which returns focus there on close).
 */
export default function SourceDetailModal({
    open,
    source,
    projectLabel = null,
    onClose,
    pinned = false,
    onTogglePin,
    saved = false,
    onToggleSave,
    launcherButtonRef,
}) {
    if (!source) return null;

    const pinnable = PINNABLE_KINDS.has(source.kind);
    const excerptClass = VERBATIM_KINDS.has(source.kind)
        ? `${styles.excerpt} ${styles.verbatim}`
        : styles.excerpt;

    return (
        <Modal
            open={open}
            className={styles.modal}
            modalHeading={source.title}
            passiveModal
            size="md"
            onRequestClose={onClose}
            launcherButtonRef={launcherButtonRef}
        >
            <div className={styles.meta}>
                <KindTag kind={source.kind} />
                {source.page && <span className={styles.page}>p. {source.page}</span>}
                {projectLabel && <span>{projectLabel}</span>}
                {projectLabel && source.date && <span aria-hidden="true">·</span>}
                {source.date && <span>{source.date}</span>}
            </div>

            <div className={styles.document}>
                {source.contextBefore && <p className={styles.context}>{source.contextBefore}</p>}
                <figure className={styles.cited}>
                    <figcaption className={styles.citedLabel}>Cited excerpt</figcaption>
                    <blockquote className={excerptClass}>{source.excerpt}</blockquote>
                </figure>
                {source.contextAfter && <p className={styles.context}>{source.contextAfter}</p>}
            </div>

            <InlineNotification
                kind="info"
                title="Preview only"
                subtitle="Pins and saved insights aren't stored yet — they reset when you leave this page."
                lowContrast
                hideCloseButton
            />
            <div className={styles.actions}>
                {pinnable && (
                    <Button
                        kind="tertiary"
                        size="md"
                        renderIcon={pinned ? PinFilled : Pin}
                        aria-pressed={pinned}
                        onClick={onTogglePin}
                    >
                        {pinned ? 'Pinned as top finding' : 'Pin as top finding'}
                    </Button>
                )}
                <Button
                    kind="tertiary"
                    size="md"
                    renderIcon={saved ? BookmarkFilled : Bookmark}
                    aria-pressed={saved}
                    onClick={onToggleSave}
                >
                    {saved ? 'Saved as insight' : 'Save as insight'}
                </Button>
            </div>
        </Modal>
    );
}
