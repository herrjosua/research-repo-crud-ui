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
