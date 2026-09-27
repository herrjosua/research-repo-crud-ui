import LeftRail from './LeftRail';
import { PROJECTS } from '../mock/constants';
import { CONVERSATIONS } from '../mock/conversations';

// Grouped under Ask the Repo. No PropTypes/TS on LeftRail, so `argTypes`
// is given explicitly (same reasoning as sources/KindTag.stories.jsx);
// `activeProjectId`/`activeConversationId` are closed enums over the mock
// data's own ids, so `select` is the real control, not free text. The
// rail's collapsed/expanded state isn't a prop (it's local UI state, per
// LeftRail.jsx's doc comment) so there's no argType for it — use the
// rendered story's own collapse button to see that.
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
