import { Tag } from '@carbon/react';
import { KIND_META } from './kindMeta';
import styles from './KindTag.module.scss';

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
