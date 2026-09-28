import { Tag } from '@carbon/react';
import { recordKind } from './recordKinds';

/**
 * A record's kind (Raw, Finding, Component, Analytics, Deliverable) as a
 * small Carbon `Tag` in that kind's color — on each Research Records card
 * and in the record detail modal's label. Same approach as Ask the Repo's
 * `KindTag` (a Carbon `Tag` type per kind, so both themes come from
 * Carbon's own tag tokens), for the record taxonomy instead of the source
 * one.
 */
export default function RecordKindTag({ kind }) {
    const meta = recordKind(kind);
    return (
        <Tag type={meta.tagType} size="sm">
            {meta.label}
        </Tag>
    );
}
