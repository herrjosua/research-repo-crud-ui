// Carbon's Tag component ships red/magenta/purple/blue/cyan/teal/green/
// gray/cool-gray/warm-gray/high-contrast/outline — no orange. `transcript`
// starts from the neutral `gray` type here; KindTag.module.scss layers the
// real orange-40 global token on top. See ../TOKEN_MAPPING.md#kindtag.
export const KIND_META = {
    interview: { label: 'Interview', tagType: 'blue' },
    survey: { label: 'Survey', tagType: 'purple' },
    doc: { label: 'Doc', tagType: 'teal' },
    transcript: { label: 'Transcript', tagType: 'orange' },
    synthesis: { label: 'Synthesis', tagType: 'red' },
};

// Kinds a source can be pinned "as top finding" from — primary evidence
// only. Mirrors SourceCard.tsx/SourceDetailModal.tsx in the reference,
// which never offer the pin for `synthesis`/`doc` sources (those are
// already secondary write-ups, not findings in their own right). The
// reference additionally requires a title match against its mock finding
// records. Real sources from POST /api/ask carry no such flag, so the kind
// rule is the whole rule here.
export const PINNABLE_KINDS = new Set(['interview', 'survey', 'transcript']);
