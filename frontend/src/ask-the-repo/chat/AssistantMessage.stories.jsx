import { useState } from 'react';
import AssistantMessage from './AssistantMessage';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

const SAMPLE_MESSAGE = INITIAL_MESSAGES_BY_CONVERSATION.c1[1];

// Grouped under Ask the Repo, alongside the rest of the chat panel. No
// PropTypes/TS on AssistantMessage, so `argTypes` is given explicitly
// (same reasoning as sources/KindTag.stories.jsx).
export default {
  title: 'Ask the Repo/AssistantMessage',
  component: AssistantMessage,
  argTypes: {
    saved: { control: 'boolean' },
  },
};

// Live-editable playground, using the real mock reply from
// mock/messages.js (bold emphasis + four cited sources across all five
// KindTag kinds). `saved` toggles the "Save as deliverable" affordance's
// two states directly from Controls; clicking the button in the canvas
// itself is wired through local state so the click is visibly real, not
// a no-op.
function ToggleableAssistantMessage(args) {
  const [saved, setSaved] = useState(args.saved);
  return <AssistantMessage {...args} saved={saved} onToggleSave={() => setSaved((v) => !v)} />;
}

export const Default = {
  args: {
    message: SAMPLE_MESSAGE,
    saved: false,
  },
  render: (args) => <ToggleableAssistantMessage {...args} />,
};

// A reply with no sources — the citation list this ticket intentionally
// keeps static (see AssistantMessage.jsx's doc comment) simply doesn't
// render when there's nothing to cite.
export const WithoutSources = {
  args: {
    message: { ...SAMPLE_MESSAGE, sources: undefined },
    saved: false,
  },
};
