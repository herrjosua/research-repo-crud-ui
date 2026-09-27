import ProjectSwitcher from './ProjectSwitcher';
import { PROJECTS } from '../mock/constants';

// Grouped under Ask the Repo, alongside the rest of the left rail. No
// PropTypes/TS on ProjectSwitcher, so `argTypes` is given explicitly here
// (same reasoning as sources/KindTag.stories.jsx); `activeProjectId` is a
// closed enum (one of the mock `PROJECTS`' ids), so `select` is the real
// control, not free text. `onSelectProject` gets no explicit argType —
// Storybook's actions addon auto-detects `on*`-named args and logs calls
// in the Actions panel without one.
export default {
  title: 'Ask the Repo/ProjectSwitcher',
  component: ProjectSwitcher,
  argTypes: {
    activeProjectId: {
      control: 'select',
      options: PROJECTS.map((project) => project.id),
    },
  },
};

// Live-editable playground: flip `activeProjectId` in Controls to move the
// selected-state styling (background/border-inline-start accent) between
// rows, and watch onSelectProject calls land in the Actions panel when
// clicking a different project.
export const Default = {
  args: {
    projects: PROJECTS,
    activeProjectId: 'checkout',
  },
};
