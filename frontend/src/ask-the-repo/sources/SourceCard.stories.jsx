import { useState } from 'react';
import SourceCard from './SourceCard';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../fixtures/messages';
import { projectLabelFor } from '../fixtures/constants';
import styles from './SourceCard.stories.module.scss';

const SOURCES = INITIAL_MESSAGES_BY_CONVERSATION.c1[1].sources;
const SOURCES_BY_LABEL = Object.fromEntries(SOURCES.map((source) => [`${source.kind} — ${source.title}`, source]));

// Grouped under Ask the Repo, next to KindTag. No PropTypes/TS on
// SourceCard, so `argTypes` is given explicitly (same reasoning as
// KindTag.stories.jsx). `source` is a closed set — the fixture sources
// from fixtures/messages.js, one per kind except `doc` — so it's a `select`
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
  return (
    <SourceCard
      {...args}
      projectLabel={projectLabelFor(args.source.recordProject)}
      pinned={pinned}
      onTogglePin={() => setPinned((v) => !v)}
      onOpen={() => {}}
    />
  );
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
            <SourceCard
              source={source}
              projectLabel={projectLabelFor(source.recordProject)}
              selected={selected}
              pinned={pinned}
              onOpen={() => {}}
              onTogglePin={() => {}}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};

// Real sources can lack either half of the meta line: components carry no
// date, and a record in a corpus without a project list has no project.
// The card shows whichever exists, and drops the line when neither does.
export const MissingDate = {
  render: () => (
    <div className={styles.states}>
      <div>
        <p className={styles.stateLabel}>Project, no date</p>
        <SourceCard
          source={{ ...SOURCES[3], date: null }}
          projectLabel={projectLabelFor(SOURCES[3].recordProject)}
          onOpen={() => {}}
          onTogglePin={() => {}}
        />
      </div>
      <div>
        <p className={styles.stateLabel}>No project, no date</p>
        <SourceCard source={{ ...SOURCES[0], date: null, recordProject: null }} onOpen={() => {}} onTogglePin={() => {}} />
      </div>
    </div>
  ),
};

// A source from a raw session's correction file (POST /api/ask's
// `source.correction`): its CorrectionTag beside the KindTag and its
// "Corrected <date>" line below the meta line, on each of the card's
// backgrounds, and at the md floor's width, where the CorrectionTag wraps
// below the KindTag rather than overflow the card.
const CORRECTION_SOURCE = {
  ...SOURCES[2],
  id: 'raw:2026-02-17-session-lock#6',
  title: 'Contextual Inquiry — Session Lock During Dictation',
  excerpt: 'Only the 4 shadowed clinicians went through a lock during dictation, so all 4 clinicians assumed the draft was lost.',
  date: 'Feb 17, 2026',
  page: undefined,
  section: 'Correction (2026-09-27): Draft-loss result',
  correction: { date: '2026-09-27' },
};

const CORRECTION_STATES = [
  { label: 'Default', className: undefined },
  { label: 'Hover', className: styles.forceHover },
  { label: 'Selected', selected: true },
  { label: 'md floor (672px viewport)', className: styles.mdFloor },
];

export const Correction = {
  render: () => (
    <div className={styles.states}>
      {CORRECTION_STATES.map(({ label, className, selected }) => (
        <div key={label}>
          <p className={styles.stateLabel}>{label}</p>
          <div className={className}>
            <SourceCard
              source={CORRECTION_SOURCE}
              projectLabel={projectLabelFor(CORRECTION_SOURCE.recordProject)}
              selected={selected}
              onOpen={() => {}}
              onTogglePin={() => {}}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};
