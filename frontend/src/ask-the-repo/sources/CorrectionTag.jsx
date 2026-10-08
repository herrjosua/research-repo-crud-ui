import { Tag } from '@carbon/react';
import kindTagStyles from './KindTag.module.scss';

/**
 * Small chip marking a cited source as a raw session's correction file
 * (POST /api/ask's `source.correction`), shown next to the source's
 * KindTag. Carbon's `Tag` in its neutral `gray` type with KindTag's own
 * chip style, so no new color: the tag supplies its own Carbon-tested
 * background/text pair on every surface it sits on. The visible text is
 * its whole accessible name (no `aria-label`). The correction's date is
 * shown as metadata instead (./correctedLabel.js).
 */
export default function CorrectionTag() {
    return (
        <Tag type="gray" size="sm" className={kindTagStyles.tag}>
            Correction
        </Tag>
    );
}
