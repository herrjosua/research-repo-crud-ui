import { useId } from 'react';
import { Dropdown } from '@carbon/react';
import { hideMenuIconLabel } from '../../carbonDropdown';
import styles from './ProjectSwitcher.module.scss';

/**
 * Project picker for the Ask the Repo left rail: a Carbon Dropdown,
 * labelled "Project", pinned under "New chat". Its items are the synthetic
 * "All projects" entry, then GET /api/ask/config's list, by label only
 * (Carbon truncates a long one, with the full label on hover); the closed
 * field shows the selected project's label. Selecting one sets the active
 * project context that the conversation list below it
 * (`ConversationList`, via `LeftRail`) filters against, and that new
 * questions are scoped to.
 *
 * When the selected project has a record count, helper text under the
 * field says how many records a question searches ("Searches 21
 * records"). Carbon points the field's aria-describedby at it, so screen
 * readers hear it with the field. At the md floor it can wrap, so it
 * keeps two lines' height there (see ProjectSwitcher.module.scss). The
 * rows don't show counts: at the md floor's 136px rail a count left about
 * four characters of each label.
 *
 * A dropdown rather than a list so the number of projects (ten in the
 * real corpus) can't take height away from Recent, and so the rail doesn't
 * jump when the config loads: the closed field is the same height whether
 * there is one project or ten.
 *
 * `projects` (array of `{ id, label, count? }` — array order is display
 * order; see `../fixtures/constants.js`. `count` is how many records a
 * question in that project searches; left out, e.g. in static mode, there
 * is no helper text. The id "all" is the no-filter entry, as in POST
 * /api/ask's `project`), `activeProjectId` (the selected project's `id`),
 * `onSelectProject(id)`.
 */
export default function ProjectSwitcher({ projects, activeProjectId, onSelectProject }) {
    // Unique per instance: autodocs renders several stories on one page.
    const id = useId();
    // Controlled by id; Dropdown matches the selected item by reference, so
    // it's looked up in the current array (a new one once the config loads).
    const selectedProject = projects.find((project) => project.id === activeProjectId) ?? null;

    return (
        <div className={styles.switcher}>
            <Dropdown
                id={id}
                titleText="Project"
                label="Choose a project"
                size="sm"
                translateWithId={hideMenuIconLabel}
                items={projects}
                selectedItem={selectedProject}
                helperText={searchScope(selectedProject)}
                itemToString={(project) => project?.label ?? ''}
                onChange={({ selectedItem }) => {
                    if (selectedItem) onSelectProject(selectedItem.id);
                }}
            />
        </div>
    );
}

function searchScope(project) {
    if (project?.count == null) return undefined;
    const records = project.count === 1 ? 'record' : 'records';
    return project.id === 'all'
        ? `Searches all ${project.count} ${records}`
        : `Searches ${project.count} ${records}`;
}
