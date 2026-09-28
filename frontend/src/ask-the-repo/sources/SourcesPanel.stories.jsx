import { useState } from 'react';
import SourcesPanel from './SourcesPanel';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../fixtures/messages';
import { projectLabelFor } from '../fixtures/constants';
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
  'Reply with no sources': {
    ...INITIAL_MESSAGES_BY_CONVERSATION.c1[1],
    id: 'm-none',
    content: "The provided sources don't say how long admins took to finish workspace setup.",
    sources: [],
  },
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

// The panel is controlled: the source detail modal, the last-opened
// ("selected") source and pins live in AskTheRepo.jsx, since an answer's
// inline citations open the same modal. Each story keeps the selected and
// pinned state locally, so clicking a card highlights it and pins toggle.
function SourcesPanelWithState(args) {
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [pinnedIds, setPinnedIds] = useState(() => new Set());
  return (
    <SourcesPanel
      {...args}
      selectedSourceId={selectedSourceId}
      onOpenSource={(source) => setSelectedSourceId(source.id)}
      pinnedIds={pinnedIds}
      onTogglePin={(source) => setPinnedIds((prev) => {
        const next = new Set(prev);
        if (next.has(source.id)) next.delete(source.id);
        else next.add(source.id);
        return next;
      })}
      projectLabelFor={projectLabelFor}
    />
  );
}

// Live-editable playground: click a card to select it, pin a source — all
// session-only (see the footer note).
export const Default = {
  args: {
    message: 'c1 reply — 4 sources',
  },
  render: (args) => (
    <div className={styles.frame}>
      <SourcesPanelWithState {...args} />
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
      <SourcesPanelWithState {...args} />
    </div>
  ),
};

// A reply that cited nothing (the question isn't covered): the rail says
// so instead of the "sources will appear" empty state.
export const ReplyWithoutSources = {
  args: {
    message: 'Reply with no sources',
  },
  render: Default.render,
};
