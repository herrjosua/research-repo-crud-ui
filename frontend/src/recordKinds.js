// The five record kinds, in the order the rail lists them, with Direction B
// v2's labels and colors (docs/Build_Direction_B_v2_Design_decomposed's
// `RECORD_KIND`: raw teal-60, finding green-60, component red-60, analytics
// purple-60, deliverable magenta-70). Each color is carried by a Carbon
// `Tag` type rather than a hex, so the badge re-themes with Carbon's own
// tag tokens; styles/_variables.scss's `$record-kind-colors` takes the
// card stripe and rail swatch from the same tokens.
export const RECORD_KINDS = [
    { id: 'raw', label: 'Raw', tagType: 'teal' },
    { id: 'finding', label: 'Finding', tagType: 'green' },
    { id: 'component', label: 'Component', tagType: 'red' },
    { id: 'analytics', label: 'Analytics', tagType: 'purple' },
    { id: 'deliverable', label: 'Deliverable', tagType: 'magenta' },
];

export const RECORD_KIND_IDS = RECORD_KINDS.map((kind) => kind.id);

const BY_ID = new Map(RECORD_KINDS.map((kind) => [kind.id, kind]));

// Unknown kinds fall back to a neutral gray tag labeled with the raw id,
// rather than throwing on data the list doesn't know yet.
export function recordKind(id) {
    return BY_ID.get(id) ?? { id, label: id, tagType: 'gray' };
}
