import KindTag from './KindTag';
import { KIND_META } from './kindMeta';

// Verification story for the Storybook theme decorator (see .storybook/
// preview.js): KindTag is entirely theme.$x-driven except for its `orange`
// override, which is layered on via a real Carbon global color, not a
// theme.$x token — the closest thing this repo has to a component that
// exercises both the standard re-theming path and its one documented
// exception (see ../TOKEN_MAPPING.md#kindtag). Rendering every kind here
// makes it a single reference point to flip the theme toolbar against.
export default {
  title: 'ask-the-repo/KindTag',
  component: KindTag,
};

export const AllKinds = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {Object.keys(KIND_META).map((kind) => (
        <KindTag key={kind} kind={kind} />
      ))}
    </div>
  ),
};
