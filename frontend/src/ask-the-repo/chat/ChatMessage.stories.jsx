import ChatMessage from './ChatMessage';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

const [USER_MESSAGE, ASSISTANT_MESSAGE] = INITIAL_MESSAGES_BY_CONVERSATION.c1;

// Grouped under Ask the Repo, alongside the rest of the chat panel. No
// PropTypes/TS on ChatMessage, so `argTypes` is given explicitly (same
// reasoning as sources/KindTag.stories.jsx); `message.role` is a closed
// two-value enum, so `select` (mapped to the two real mock messages) is
// the real control, not a free-text/object field.
export default {
  title: 'Ask the Repo/ChatMessage',
  component: ChatMessage,
  argTypes: {
    message: {
      control: 'select',
      options: ['user', 'assistant'],
      mapping: { user: USER_MESSAGE, assistant: ASSISTANT_MESSAGE },
    },
  },
};

// Live-editable playground: flip `message` in Controls between the
// reference's real user question and its real assistant reply to see
// both branches ChatMessage.jsx renders.
export const Default = {
  args: {
    message: 'user',
    saved: false,
  },
};
