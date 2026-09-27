import { Pin, PinFilled } from '@carbon/icons-react';
import KindTag from './KindTag';
import { PINNABLE_KINDS } from './kindMeta';
import styles from './SourceCard.module.scss';

/**
 * One cited source in the Ask the Repo sources rail: kind tag, page,
 * title, a two-line excerpt, and project/date. Clicking anywhere on the
 * card opens the source detail modal; primary-evidence kinds also get a
 * "Pin as top finding" toggle. Reimplements the Direction B v2 reference's
 * `SourceCard.tsx` on Carbon/SCSS.
 *
 * The title is the card's one real `<button>`, stretched over the whole
 * card with a `::after` overlay (see `.open` in SourceCard.module.scss),
 * rather than the card itself being a button: KindTag renders Carbon's
 * `Tag`, a `<div>`, which isn't valid inside a `<button>`, and the pin
 * toggle is its own control, which can't nest inside another button. The
 * title also makes a concise accessible name for "open this source".
 *
 * Pinning is UI-only for now (real persistence is v1.3.7): `pinned` /
 * `onTogglePin` flip session state one level up in `SourcesPanel`, and the
 * panel's footer says so, rather than this button implying it's saved.
 *
 * The pin is a plain icon + text button — the same pattern as Story 4's
 * "Save as deliverable" (`../chat/AssistantMessage.jsx`) — not Carbon's
 * `Button`: at the md floor (672px viewport) this card has ~107px of
 * content width, and Carbon's `Button` never wraps its label and reserves
 * wide end padding for its icon, so it overflowed the card (measured
 * 164px). This one wraps instead.
 *
 * `source` (`../mock/messages.js`'s source shape), `selected` (bool — the
 * source whose detail modal is open, or was opened last), `onOpen(event)`,
 * `pinned` (bool), `onTogglePin()`.
 */
export default function SourceCard({ source, selected = false, onOpen, pinned = false, onTogglePin }) {
    const pinnable = PINNABLE_KINDS.has(source.kind);

    return (
        <article className={selected ? `${styles.card} ${styles.selected}` : styles.card}>
            <div className={styles.row}>
                <KindTag kind={source.kind} />
                {source.page && <span className={styles.page}>p. {source.page}</span>}
            </div>
            <button type="button" className={styles.open} aria-haspopup="dialog" onClick={onOpen}>
                {source.title}
            </button>
            <p className={styles.excerpt}>“{source.excerpt}”</p>
            <p className={styles.meta}>
                {source.project} · {source.date}
            </p>
            {pinnable && (
                <button type="button" className={styles.pin} aria-pressed={pinned} onClick={onTogglePin}>
                    {pinned ? <PinFilled size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
                    {pinned ? 'Pinned as top finding' : 'Pin as top finding'}
                </button>
            )}
        </article>
    );
}
