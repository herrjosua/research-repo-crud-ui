import { useState } from 'react';
import { fn } from 'storybook/test';
import AssistantMessage from './AssistantMessage';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../fixtures/messages';

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
  args: {
    onOpenSource: fn(),
  },
};

// Live-editable playground, using the fixture reply from
// fixtures/messages.js: plain text in POST /api/ask's shape, with a "- "
// list, a single line break, and [n] citations over four sources across
// the KindTag kinds. `saved` toggles the "Save as deliverable" preview's
// two states directly from Controls; clicking the button in the canvas
// itself is wired through local state so the click is visibly real.
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

// A reply that cites nothing — what the endpoint returns when the corpus
// doesn't cover the question: the answer, then a note in place of the
// source list.
export const WithoutSources = {
  args: {
    message: {
      ...SAMPLE_MESSAGE,
      content: "The provided sources don't say how long admins took to finish workspace setup.",
      sources: [],
    },
    saved: false,
  },
};

// Inline citations as the real endpoint produces them: adjacent markers
// ([1][2]), one marker per sentence, and — since model text is untrusted —
// a number with no source ([3] here, with two sources), which stays plain
// text. Each marker opens its source (see the Actions panel).
const PRIOR_AUTH_SOURCES = [
  {
    id: 'raw:2025-04-08-usability-test-prior-auth-ai-v1#3',
    kind: 'transcript',
    title: 'Usability Test — AI-Assisted Prior Authorization Drafting (v1)',
    excerpt: 'In 2 of 4 cases, the AI draft cited outdated diagnosis codes still present elsewhere in the chart.',
    project: null,
    recordProject: 'project-prior-auth',
    date: 'Apr 8, 2025',
  },
  {
    id: 'raw:2025-11-04-usability-test-prior-auth-ai-v2#2',
    kind: 'transcript',
    title: 'Usability Test — AI-Assisted Prior Authorization Drafting (v2, Follow-up)',
    excerpt: 'The outdated diagnosis code issue from v1 did not recur in any of the 4 test cases.',
    project: null,
    recordProject: 'project-prior-auth',
    date: 'Nov 4, 2025',
  },
];

const CITED_MESSAGE = {
  id: 'm-cited',
  role: 'assistant',
  content: 'The v1 test found that in 2 of 4 cases the AI draft cited outdated diagnosis codes [1]. In v2 the issue did not recur [2], and participants checked citations before accepting a draft [1][2].\n\nNothing in the sources covers turnaround time [3].',
  sources: PRIOR_AUTH_SOURCES,
  timestamp: '10:14',
};

export const WithCitations = {
  args: {
    message: CITED_MESSAGE,
    saved: false,
  },
};

// The citation button is the one custom-styled control here (Carbon's link
// colors on a bordered chip), so it gets a dark-theme snapshot too.
export const WithCitationsDark = {
  args: WithCitations.args,
  globals: { theme: 'g100' },
};
