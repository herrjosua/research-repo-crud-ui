import { useState } from 'react';
import { fn } from 'storybook/test';
import ChatPanel from './ChatPanel';
import { useAskRepo } from './useAskRepo';
import { STARTERS } from './starters';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../fixtures/messages';

const THREAD = INITIAL_MESSAGES_BY_CONVERSATION.c1;
const QUESTION = 'What did the prior auth usability tests find?';
const USER_MESSAGE = { id: 'm-q', role: 'user', content: QUESTION, timestamp: '10:14' };

// Grouped under Ask the Repo. ChatPanel is presentational: everything it
// shows comes from `useAskRepo` (owned by AskTheRepo.jsx) as props, so each
// state below is just a set of args, with no network or timers involved.
export default {
  title: 'Ask the Repo/ChatPanel',
  component: ChatPanel,
  argTypes: {
    status: { control: 'select', options: ['idle', 'loading', 'error'] },
    slow: { control: 'boolean' },
    unavailable: { control: 'boolean' },
  },
  args: {
    messages: [],
    starters: STARTERS.all,
    onSend: fn(),
    onRetry: fn(),
    onSignIn: fn(),
    onOpenSource: fn(),
  },
};

// Live playground: the real `useAskRepo` store with a stand-in for POST
// /api/ask that answers after a moment with the fixture reply, so sending
// a question (or picking a starter, then sending) walks through the
// loading state to an answer in the canvas.
function ChatPanelPlayground(args) {
  const [ask] = useState(() => () => new Promise((resolve) => {
    setTimeout(() => resolve({ answer: THREAD[1].content, sources: THREAD[1].sources, model: 'gemma2:9b' }), 900);
  }));
  const store = useAskRepo({ ask });
  const [conversationId, setConversationId] = useState(null);
  const request = conversationId ? store.getRequest(conversationId) : null;
  return (
    <ChatPanel
      {...args}
      messages={conversationId ? store.getMessages(conversationId) : []}
      status={request?.status}
      slow={request?.slow}
      error={request?.error}
      announcement={store.announcement}
      onSend={(text) => setConversationId(store.send(conversationId, 'all', text))}
    />
  );
}

// The empty state: the unfiltered starter questions (chat/starters.js).
export const Default = {
  render: (args) => <ChatPanelPlayground {...args} />,
};

// A conversation with an answer: the fixture reply's list, line break and
// inline citations, on the panel's own `$surface`.
export const WithSeededConversation = {
  args: {
    messages: THREAD,
  },
};

// Waiting for an answer: the question stays in the thread, and the
// composer is disabled until the answer or an error arrives.
export const Loading = {
  args: {
    messages: [USER_MESSAGE],
    status: 'loading',
  },
  parameters: { chromatic: { pauseAnimationAtEnd: true } },
};

// The same wait after about 5 seconds, which explains the first question's
// indexing delay. `slow` is a prop (useAskRepo sets it on a timer).
export const LoadingSlow = {
  args: {
    messages: [USER_MESSAGE],
    status: 'loading',
    slow: true,
  },
  parameters: { chromatic: { pauseAnimationAtEnd: true } },
};

// No language model on this server (GET /api/ask/config said so, or a
// question got a 503): the notice, with the composer and starters disabled.
export const Unavailable = {
  args: {
    unavailable: true,
  },
};

// Ollama failed (502): the question is back in the composer, and Try again
// re-asks it.
export const ModelError = {
  args: {
    messages: [USER_MESSAGE],
    status: 'error',
    error: { kind: 'model', question: QUESTION },
  },
};

// The session expired (401): Sign in again returns to the login form.
export const SessionExpired = {
  args: {
    messages: [USER_MESSAGE],
    status: 'error',
    error: { kind: 'session', question: QUESTION },
  },
};

// A question the corpus doesn't cover: the answer says so and cites
// nothing.
export const NoSourcesAnswer = {
  args: {
    messages: [
      { id: 'm-q', role: 'user', content: 'How long did admins take to finish workspace setup?', timestamp: '10:20' },
      {
        id: 'm-a',
        role: 'assistant',
        content: "The provided sources don't say how long admins took to finish workspace setup.",
        sources: [],
        timestamp: '10:20',
      },
    ],
  },
};
