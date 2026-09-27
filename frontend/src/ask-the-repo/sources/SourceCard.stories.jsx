import { useState } from 'react';
import SourceCard from './SourceCard';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';
import styles from './SourceCard.stories.module.scss';

const SOURCES = INITIAL_MESSAGES_BY_CONVERSATION.c1[1].sources;
const SOURCES_BY_LABEL = Object.fromEntries(SOURCES.map((source) => [`${source.kind} — ${source.title}`, source]));

// Grouped under Ask the Repo, next to KindTag. No PropTypes/TS on
// SourceCard, so `argTypes` is given explicitly (same reasoning as
// KindTag.stories.jsx). `source` is a closed set — the real mock sources
// from mock/messages.js, one per kind except `doc` — so it's a `select`
// mapped to the real objects, not a free-form JSON editor.
//
// Every story wraps the card in `.rail`: SourceCard only ever renders on
// the sources rail's `$background` (see SourceCard.module.scss), and its
// hover/selected tokens are calibrated for exactly that surface, so the
// raw story canvas would be the wrong backdrop to judge it on.
export default {
  title: 'Ask the Repo/SourceCard',
  component: SourceCard,
  argTypes: {
    source: {
      control: 'select',
      options: Object.keys(SOURCES_BY_LABEL),
      mapping: SOURCES_BY_LABEL,
    },
    selected: { control: 'boolean' },
    pinned: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className={styles.rail}>
        <Story />
      </div>
    ),
  ],
};

// Live-editable playground. `pinned` is also wired through local state, so
// clicking "Pin as top finding" in the canvas visibly toggles (switch
// `source` to the synthesis one to see the pin disappear — only
// primary-evidence kinds are pinnable, see kindMeta.js's PINNABLE_KINDS).
function ToggleableSourceCard(args) {
  const [pinned, setPinned] = useState(args.pinned);
  return <SourceCard {...args} pinned={pinned} onTogglePin={() => setPinned((v) => !v)} onOpen={() => {}} />;
}

export const Default = {
  args: {
    source: Object.keys(SOURCES_BY_LABEL)[0],
    selected: false,
    pinned: false,
  },
  render: (args) => <ToggleableSourceCard {...args} />,
};

// Regression guard (frontend/CLAUDE.md rule 8): every visual state this
// card has, on its one real background, in one snapshot — so a Chromatic
// or a11y run catches a contrast break in any of them in either theme.
// `forceHover` paints the card's real hover token (`$background-hover`)
// since a static snapshot can't hover; it must stay in sync with `.card:
// hover` in SourceCard.module.scss. The transcript card is there for its
// KindTag's orange override on each of these backgrounds.
const STATES = [
  { label: 'Default', source: SOURCES[0] },
  { label: 'Hover', source: SOURCES[0], forceHover: true },
  { label: 'Selected (modal open / last opened)', source: SOURCES[0], selected: true },
  { label: 'Pinned', source: SOURCES[1], pinned: true },
  { label: 'Pinned + selected', source: SOURCES[1], pinned: true, selected: true },
  { label: 'Transcript kind — hover', source: SOURCES[2], forceHover: true },
  { label: 'Transcript kind — selected', source: SOURCES[2], selected: true },
  { label: 'Not pinnable (synthesis)', source: SOURCES[3] },
];

export const AllStates = {
  render: () => (
    <div className={styles.states}>
      {STATES.map(({ label, source, selected, pinned, forceHover }) => (
        <div key={label}>
          <p className={styles.stateLabel}>{label}</p>
          <div className={forceHover ? styles.forceHover : undefined}>
            <SourceCard source={source} selected={selected} pinned={pinned} onOpen={() => {}} onTogglePin={() => {}} />
          </div>
        </div>
      ))}
    </div>
  ),
};
