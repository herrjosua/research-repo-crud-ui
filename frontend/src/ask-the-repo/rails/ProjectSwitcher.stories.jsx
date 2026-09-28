import { within, userEvent } from 'storybook/test';
import ProjectSwitcher from './ProjectSwitcher';
import { CONFIG_PROJECTS, PROJECTS } from '../fixtures/constants';
import styles from './LeftRail.stories.module.scss';

// Grouped under Ask the Repo, alongside the rest of the left rail. No
// PropTypes/TS on ProjectSwitcher, so `argTypes` is given explicitly here
// (same reasoning as sources/KindTag.stories.jsx); `activeProjectId` is a
// closed enum (one of the fixture `PROJECTS`' ids), so `select` is the real
// control, not free text. `onSelectProject` gets no explicit argType —
// Storybook's actions addon auto-detects `on*`-named args and logs calls
// in the Actions panel without one.
//
// Every story renders in the rail's real frame (its width and height, on
// its `$background`), which also leaves the open menu room to show.
export default {
  title: 'Ask the Repo/ProjectSwitcher',
  component: ProjectSwitcher,
  argTypes: {
    activeProjectId: {
      control: 'select',
      options: PROJECTS.map((project) => project.id),
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

async function openMenu({ canvasElement }) {
  await userEvent.click(within(canvasElement).getByRole('combobox', { name: /Project/ }));
}

// Live-editable playground: flip `activeProjectId` in Controls to change
// the project the closed dropdown shows, and watch onSelectProject calls
// land in the Actions panel when choosing a different project.
export const Default = {
  args: {
    projects: PROJECTS,
    activeProjectId: 'checkout',
  },
};

// The real corpus's ten projects, open: each with its record count, the
// selected one checked, and long labels truncated ahead of their counts.
export const Open = {
  args: {
    projects: CONFIG_PROJECTS,
    activeProjectId: 'all',
  },
  argTypes: {
    activeProjectId: { options: CONFIG_PROJECTS.map((project) => project.id) },
  },
  play: openMenu,
};

// The same, at the md floor's 136px rail.
export const OpenNarrow = {
  ...Open,
  decorators: [
    (Story) => (
      <div className={styles.narrow}>
        <Story />
      </div>
    ),
  ],
};

// A corpus with no project list (GET /api/ask/config returns
// `projects: []`, e.g. the e2e and test corpora), and the picker before the
// config loads: only the no-filter entry, and no count, since there are no
// project counts to total. The closed field is the same height as with ten
// projects, so the rail doesn't move when the list arrives.
export const AllOnly = {
  args: {
    projects: [{ id: 'all', label: 'All projects' }],
    activeProjectId: 'all',
  },
  play: openMenu,
};
