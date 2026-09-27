import { Tag } from '@carbon/react';
import { KIND_META } from './kindMeta';
import styles from './KindTag.module.scss';

/**
 * Small uppercase/mono chip labeling a source's kind (interview, survey,
 * doc, transcript, synthesis) — a fixed 5-value taxonomy, not a
 * theme-dependent color. Built ahead of its first real consumer
 * (`SourceCard`, planned) so the Ask the Repo token mapping had a concrete
 * component to verify against; see `../TOKEN_MAPPING.md#kindtag`.
 *
 * Wraps Carbon's `Tag`, which has no `orange` type: `transcript` renders
 * from the neutral `gray` type, with `KindTag.module.scss` layering the
 * real `orange-40` global color on top.
 *
 * `kind` (one of `interview` | `survey` | `doc` | `transcript` |
 * `synthesis`): key into `KIND_META`, selecting the label text and Carbon
 * `Tag` color.
 */
export default function KindTag({ kind }) {
    const meta = KIND_META[kind];
    const isOrange = meta.tagType === 'orange';

    return (
        <Tag
            type={isOrange ? 'gray' : meta.tagType}
            size="sm"
            className={isOrange ? `${styles.tag} ${styles.orange}` : styles.tag}
        >
            {meta.label}
        </Tag>
    );
}
