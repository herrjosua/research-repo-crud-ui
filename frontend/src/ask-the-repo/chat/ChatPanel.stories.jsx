import ChatPanel from './ChatPanel';
import { PROJECTS } from '../mock/constants';
import { CONVERSATIONS } from '../mock/conversations';

// Grouped under Ask the Repo. No PropTypes/TS on ChatPanel, so `argTypes`
// is given explicitly (same reasoning as sources/KindTag.stories.jsx);
// `projectId`/`conversationId` are closed enums over the mock data's own
// ids (plus `null` for conversationId, meaning "no conversation open"),
// so `select` is the real control, not free text.
export default {
  title: 'Ask the Repo/ChatPanel',
  component: ChatPanel,
  argTypes: {
    projectId: {
      control: 'select',
      options: PROJECTS.map((project) => project.id),
    },
    conversationId: {
      control: 'select',
      options: [null, ...CONVERSATIONS.map((conv) => conv.id)],
    },
  },
};

// Live-editable playground: with `conversationId` left at `null` (the
// default in AskTheRepo.jsx before a rail conversation is opened), this
// shows the starter-question empty state, scoped to whichever
// `projectId` Controls is set to. Type a message and send it (or click a
// starter to fill the composer first) to see the mock reply and the
// "Save as deliverable" affordance.
export const Default = {
  args: {
    projectId: 'checkout',
    conversationId: null,
  },
};

// `c1` is the one conversation with seeded history (mock/messages.js) —
// this is what LeftRail's "Pain points in checkout flow" opens into.
export const WithSeededConversation = {
  args: {
    projectId: 'checkout',
    conversationId: 'c1',
  },
};
