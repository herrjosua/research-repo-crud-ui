import { useId } from 'react';
import { Dropdown } from '@carbon/react';
import styles from './ProjectSwitcher.module.scss';

/**
 * Project picker for the Ask the Repo left rail: a Carbon Dropdown,
 * labelled "Project", pinned under "New chat". Its items are the synthetic
 * "All projects" entry, then GET /api/ask/config's list, each showing its
 * record count when there is one; the closed field shows the selected
 * project's label. Selecting one sets the active project context that the
 * conversation list below it (`ConversationList`, via `LeftRail`) filters
 * against, and that new questions are scoped to.
 *
 * A dropdown rather than a list so the project count (ten in the real
 * corpus) can't take height away from Recent, and so the rail doesn't
 * jump when the config loads: the closed field is the same height whether
 * there is one project or ten.
 *
 * `projects` (array of `{ id, label, count? }` — array order is display
 * order; see `../fixtures/constants.js`),
 * `activeProjectId` (the selected project's `id`), `onSelectProject(id)`.
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
                items={projects}
                selectedItem={selectedProject}
                itemToString={(project) => project?.label ?? ''}
                itemToElement={renderOption}
                onChange={({ selectedItem }) => {
                    if (selectedItem) onSelectProject(selectedItem.id);
                }}
            />
        </div>
    );
}

// The count is visual shorthand; screen readers get it spelled out
// ("Onboarding, 21 records") rather than run into the label ("Onboarding21").
function renderOption(project) {
    return (
        <span className={styles.option} title={project.label}>
            <span className={styles.label}>{project.label}</span>
            {project.count != null && (
                <>
                    <span className="cds--visually-hidden">, {project.count} records</span>
                    <span className={styles.count} aria-hidden="true">{project.count}</span>
                </>
            )}
        </span>
    );
}
