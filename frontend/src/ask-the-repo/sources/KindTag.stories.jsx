import KindTag from './KindTag';
import { KIND_META } from './kindMeta';
import styles from './KindTag.stories.module.scss';

// Real background contexts KindTag is confirmed to render against, for
// `AllBackgrounds` below — see KindTag.module.scss's comment on `.orange`
// for the incident this guards against (a third context broke after the
// first two were each patched individually). `wrapClass`/`innerClass`
// mirror the two-layer structure real usage renders with — an alpha
// overlay (`hover`/`selected`) always sits on top of the real
// `$background` it composites over, never floating alone.
const BACKGROUND_CONTEXTS = [
    { label: 'Rail — default ($background)' },
    { label: 'Rail — hover ($background-hover over $background)', innerClass: styles.hover },
    { label: 'Rail — selected ($background-selected over $background)', innerClass: styles.selected },
    { label: 'Chat citations / future source panel ($surface)', wrapClass: styles.surface },
];

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

// Permanent regression guard, not just a one-off check: renders every kind
// against every real background this chip is confirmed to render on (see
// BACKGROUND_CONTEXTS above), so an a11y/Chromatic run catches a future
// contrast break in any of them automatically — the `transcript`/orange
// kind is the one that actually needs this (see KindTag.module.scss's
// `.orange` comment), but every kind renders in each context so a future
// categorical color gets the same coverage without a second story to add.
// `AllKinds` above (unwrapped, straight on the raw story canvas) stays as
// its own case too — it's the literal context that first surfaced the
// Storybook-Docs-canvas failure this guards against.
export const AllBackgrounds = {
  render: () => (
    <div className={styles.contexts}>
      {BACKGROUND_CONTEXTS.map(({ label, wrapClass, innerClass }) => (
        <div key={label}>
          <p className={styles.contextLabel}>{label}</p>
          <div className={wrapClass ? `${styles.context} ${wrapClass}` : styles.context}>
            <div className={innerClass ? `${styles.tags} ${innerClass}` : styles.tags}>
              {Object.keys(KIND_META).map((kind) => (
                <KindTag key={kind} kind={kind} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
};
