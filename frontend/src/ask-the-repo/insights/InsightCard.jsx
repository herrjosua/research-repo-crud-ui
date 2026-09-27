import { useId, useState } from 'react';
import { Tile, Button, IconButton } from '@carbon/react';
import { Close } from '@carbon/icons-react';
import KindTag from '../sources/KindTag';
import styles from './InsightCard.module.scss';

// Same cutoff as the reference's InsightCard.tsx. A character count, not a
// CSS line clamp, so whether to offer "Show more" is known up front
// without measuring rendered height (frontend/CLAUDE.md rule 12).
export const PREVIEW_LENGTH = 180;

/**
 * One saved insight in the Saved Insights tab: the cited source's kind tag
 * and the date it was saved, the source title, the insight's content
 * (collapsed to a 180-character preview when longer, with a Show more /
 * Show less toggle), and a remove action. Reimplements the Direction B v2
 * reference's `InsightCard.tsx` on Carbon: a `Tile` (the `$layer-01`
 * surface Carbon intends for content cards on a `$background` page),
 * a ghost `Button` for the toggle, and a ghost `IconButton` for remove.
 *
 * Every insight comes from a source for now ("Save as insight" in the
 * sources rail), so the card shows that source's KindTag in place of the
 * reference's generic "Chat"/"Source" chip.
 *
 * The toggle only trims what's *shown*; the full text stays in the insight
 * object. `aria-expanded`/`aria-controls` tie the button to the text it
 * expands.
 *
 * `insight` (`useSavedInsights.js`'s insight shape), `onRemove()`.
 */
export default function InsightCard({ insight, onRemove }) {
    const [expanded, setExpanded] = useState(false);
    const contentId = useId();

    const isLong = insight.content.length > PREVIEW_LENGTH;
    const shown = isLong && !expanded
        ? `${insight.content.slice(0, PREVIEW_LENGTH).trimEnd()}…`
        : insight.content;

    return (
        <Tile className={styles.card}>
            <div className={styles.header}>
                <div className={styles.meta}>
                    {insight.sourceKind && <KindTag kind={insight.sourceKind} />}
                    <span>Saved {insight.date}</span>
                </div>
                <IconButton
                    kind="ghost"
                    size="sm"
                    label="Remove insight"
                    align="left"
                    className={styles.remove}
                    onClick={onRemove}
                >
                    <Close size={16} />
                </IconButton>
            </div>
            <h4 className={styles.title}>{insight.title}</h4>
            <p id={contentId} className={styles.content}>
                {shown}
            </p>
            {isLong && (
                <Button
                    kind="ghost"
                    size="sm"
                    className={styles.toggle}
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={() => setExpanded((wasExpanded) => !wasExpanded)}
                >
                    {expanded ? 'Show less' : 'Show more'}
                </Button>
            )}
        </Tile>
    );
}
