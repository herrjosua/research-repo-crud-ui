import KindTag from './KindTag';
import { KIND_META } from './kindMeta';

// Grouped under Ask the Repo: this is that feature's one component built
// ahead of its first consumer (SourceCard, planned — see
// ../TOKEN_MAPPING.md). No PropTypes/TS, so `argTypes` is given explicitly;
// `kind` is a closed enum (KIND_META's keys), so `select` is the real
// control, not free text.
export default {
  title: 'Ask the Repo/KindTag',
  component: KindTag,
  argTypes: {
    kind: {
      control: 'select',
      options: Object.keys(KIND_META),
    },
  },
};

// Live-editable playground: flip `kind` in Controls to see each Carbon Tag
// color, including the `transcript`/orange gap's `gray`-type-plus-override
// rendering (see KindTag.jsx's doc comment).
export const Default = {
  args: {
    kind: 'interview',
  },
};

// Verification story for the Storybook theme decorator (see .storybook/
// preview.js): KindTag is entirely theme.$x-driven except for its `orange`
// override, which is layered on via a real Carbon global color, not a
// theme.$x token — the closest thing this repo has to a component that
// exercises both the standard re-theming path and its one documented
// exception (see ../TOKEN_MAPPING.md#kindtag). Rendering every kind here
// makes it a single reference point to flip the theme toolbar against.
// Uses a custom `render` that ignores the inherited `kind` arg/control on
// purpose — this story shows all kinds at once, not one selectable kind.
export const AllKinds = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {Object.keys(KIND_META).map((kind) => (
        <KindTag key={kind} kind={kind} />
      ))}
    </div>
  ),
};
