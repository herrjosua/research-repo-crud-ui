import SourcesPanel from './SourcesPanel';
import { useSavedInsights } from '../insights/useSavedInsights';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';
import styles from './SourcesPanel.stories.module.scss';

// The panel's one prop is "the active assistant message" — a closed set of
// real cases, so a `select` mapped to real message objects (the seeded c1
// reply, a single-source reply, and `null` for a conversation with no
// reply yet), not a free-form JSON editor.
const MESSAGES = {
  'c1 reply — 4 sources': INITIAL_MESSAGES_BY_CONVERSATION.c1[1],
  'Reply citing 1 source': {
    ...INITIAL_MESSAGES_BY_CONVERSATION.c1[1],
    id: 'm-single',
    timestamp: '14:05',
    sources: INITIAL_MESSAGES_BY_CONVERSATION.c1[1].sources.slice(3),
  },
  'Reply with no sources': { ...INITIAL_MESSAGES_BY_CONVERSATION.c1[1], id: 'm-none', sources: undefined },
  'No reply yet (null)': null,
};

// Grouped under Ask the Repo, next to the rest of the sources rail. No
// PropTypes/TS, so `argTypes` is explicit (same reasoning as
// KindTag.stories.jsx). Every story renders inside `.frame`, a fixed-size
// box standing in for the rail's Grid Column: the panel's own
// `block-size: 100%` needs a bounded parent (AskTheRepo's height chain in
// the real page), or its list can't scroll.
export default {
  title: 'Ask the Repo/SourcesPanel',
  component: SourcesPanel,
  argTypes: {
    message: {
      control: 'select',
      options: Object.keys(MESSAGES),
      mapping: MESSAGES,
    },
  },
};

// Which sources are saved as insights lives in `useSavedInsights` (lifted
// to AskTheRepo.jsx in Story 6, since the Saved Insights tab reads it
// too), so each story mounts that same store around the panel — "Save as
// insight" in the modal still toggles for real.
function SourcesPanelWithStore(args) {
  const { savedSourceIds, toggleSourceInsight } = useSavedInsights();
  return <SourcesPanel {...args} savedSourceIds={savedSourceIds} onToggleSaveSource={toggleSourceInsight} />;
}

// Live-editable playground: click a card to open its detail modal, pin a
// source from the card or the modal, save it as an insight — all
// session-only (see the footer note and the modal's notification).
export const Default = {
  args: {
    message: 'c1 reply — 4 sources',
  },
  render: (args) => (
    <div className={styles.frame}>
      <SourcesPanelWithStore {...args} />
    </div>
  ),
};

// No assistant reply yet — the panel's empty state.
export const Empty = {
  args: {
    message: 'No reply yet (null)',
  },
  render: Default.render,
};

// The rail at its narrowest real width: Carbon's md floor (672px, the
// minimum supported viewport), where the md=2 Column leaves the rail
// 136px (measured). Guards against header/card overflow regressions there.
export const MdFloorWidth = {
  args: {
    message: 'c1 reply — 4 sources',
  },
  render: (args) => (
    <div className={`${styles.frame} ${styles.narrow}`}>
      <SourcesPanelWithStore {...args} />
    </div>
  ),
};
