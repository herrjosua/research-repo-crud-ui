import LeftRail from './LeftRail';
import { CONFIG_PROJECTS, PROJECTS } from '../fixtures/constants';
import { CONVERSATIONS } from '../fixtures/conversations';
import styles from './LeftRail.stories.module.scss';

// Grouped under Ask the Repo. No PropTypes/TS on LeftRail, so `argTypes`
// is given explicitly (same reasoning as sources/KindTag.stories.jsx);
// `activeProjectId`/`activeConversationId` are closed enums over the
// fixture data's own ids, so `select` is the real control, not free text. The
// rail's collapsed/expanded state isn't a prop (it's local UI state, per
// LeftRail.jsx's doc comment) so there's no argType for it — use the
// rendered story's own collapse button to see that.
//
// Every story renders in the rail's real frame: its width and height at
// 1280x860 with the demo banner, on its `$background`. The fixed height is
// what the rail fills in the app, so Recent scrolls here when it would
// there.
export default {
  title: 'Ask the Repo/LeftRail',
  component: LeftRail,
  argTypes: {
    activeProjectId: {
      control: 'select',
      options: PROJECTS.map((project) => project.id),
    },
    activeConversationId: {
      control: 'select',
      options: [null, ...CONVERSATIONS.map((conv) => conv.id)],
    },
  },
  decorators: [
    (Story) => (
      <div className={styles.rail}>
        <Story />
      </div>
    ),
  ],
};

// Live-editable playground: flip `activeProjectId` to see the
// conversation list re-filter (a conversation only shows if it belongs to
// the active project or is tagged `'all'`), click the header button to
// collapse/expand, and watch onSelectProject/onSelectConversation calls
// land in the Actions panel.
export const Default = {
  args: {
    projects: PROJECTS,
    activeProjectId: 'checkout',
    conversations: CONVERSATIONS,
    activeConversationId: 'c1',
  },
};

// A first visit: no questions asked yet this session.
export const EmptyHistory = {
  args: {
    projects: CONFIG_PROJECTS,
    activeProjectId: 'all',
    conversations: [],
    activeConversationId: null,
  },
};

// Conversations as useAskRepo creates them this session: titled by their
// first question, previewed by the answer's first line (a pending one has
// no preview yet), newest first. Twelve of them, more than the rail shows
// at once, so Recent scrolls on its own while New chat, the project picker
// and the footer stay put.
const SESSION_QUESTIONS = [
  ['What did coders think of the AI billing code suggestions?', 'all', '', '10:58'],
  ['What happened when the session locked during dictation?', 'project-ambient-scribe', 'Four out of four clinicians assumed the draft was lost and started re-dictating from scratch after re-authenticating.', '10:52'],
  ['Where did new staff get stuck in onboarding?', 'project-onboarding', 'Most new staff stalled at the credentialing step, waiting on access they could not request themselves.', '10:47'],
  ['Which alerts did nurses ignore most often?', 'project-care-coordination', 'Low-priority fall-risk alerts were dismissed without being opened in most observed shifts.', '10:43'],
  ['What did the prior auth usability tests find?', 'all', 'The v1 usability test found that in 2 of 4 cases, the AI draft cited outdated diagnosis codes.', '10:38'],
  ['How did patients react to the scheduling chatbot?', 'project-patient-chatbot', 'Patients liked booking after hours but abandoned the chat when asked to re-enter their insurance.', '10:34'],
  ['Which dashboard widgets did clinicians use daily?', 'project-clinician-dashboard', 'Only the task list and the lab-results widget were opened every day by every participant.', '10:29'],
  ['Did physicians trust the ambient scribe draft?', 'project-ambient-scribe', 'Physicians did not trust the draft enough to skim it, and read every line before signing.', '10:25'],
  ['What slowed down release-of-information requests?', 'project-him', 'Requests waited on manual identity checks that staff repeated for each record system.', '10:20'],
  ['Which design system components caused the most rework?', 'project-design-system', 'Teams rebuilt the data table most often, mostly to add inline editing it lacked.', '10:16'],
  ['What did clinicians say about alert fatigue?', 'all', 'Clinicians described alerts as background noise after the first hour of a shift.', '10:11'],
  ['How long did prior auth reviews take before the AI draft?', 'project-prior-auth', 'Reviews averaged about twenty minutes each, most of it spent finding chart evidence.', '10:05'],
];

export const SessionHistory = {
  args: {
    projects: CONFIG_PROJECTS,
    activeProjectId: 'all',
    conversations: SESSION_QUESTIONS.map(([title, project, lastMessage, time], index) => ({
      id: `c-${SESSION_QUESTIONS.length - index}`,
      title,
      project,
      lastMessage,
      time,
    })),
    activeConversationId: 'c-11',
  },
};
