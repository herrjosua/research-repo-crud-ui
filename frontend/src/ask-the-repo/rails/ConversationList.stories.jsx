import ConversationList from './ConversationList';
import { CONVERSATIONS } from '../fixtures/conversations';

// Grouped under Ask the Repo, alongside the rest of the left rail. No
// PropTypes/TS on ConversationList, so `argTypes` is given explicitly
// (same reasoning as sources/KindTag.stories.jsx); `activeConversationId`
// is a closed enum (one of the fixture `CONVERSATIONS`' ids) plus `null` for
// "nothing open", so `select` is the real control, not free text.
export default {
  title: 'Ask the Repo/ConversationList',
  component: ConversationList,
  argTypes: {
    activeConversationId: {
      control: 'select',
      options: [null, ...CONVERSATIONS.map((conv) => conv.id)],
    },
  },
};

// Live-editable playground: flip `activeConversationId` in Controls to
// move the selected-state styling between rows, and watch
// onSelectConversation calls land in the Actions panel on click.
export const Default = {
  args: {
    conversations: CONVERSATIONS,
    activeConversationId: 'c1',
  },
};

// The list's own empty state — distinct from the Default story rather than
// an args permutation of it, since `conversations: []` renders a wholly
// different (non-interactive) view, not just a visual variant of the list.
export const Empty = {
  args: {
    conversations: [],
    activeConversationId: null,
  },
};
