import styles from './ProjectSwitcher.module.scss';

/**
 * Project picker for the Ask the Repo left rail: a vertical list of
 * projects (including the synthetic "All Projects" entry), each showing
 * its indexed-source count. Selecting one sets the active project context
 * that the conversation list below it (`ConversationList`, via
 * `LeftRail`) filters against, and that the chat panel (Story 4) will
 * scope its answers to.
 *
 * `projects` (array of `{ id, label, count }`, matching
 * `../mock/constants.js`'s `PROJECTS` — array order is display order),
 * `activeProjectId` (the selected project's `id`), `onSelectProject(id)`.
 */
export default function ProjectSwitcher({ projects, activeProjectId, onSelectProject }) {
    return (
        <nav aria-label="Projects" className={styles.switcher}>
            <p className={styles.sectionLabel}>Projects</p>
            <ul className={styles.list}>
                {projects.map((project) => {
                    const isActive = project.id === activeProjectId;
                    return (
                        <li key={project.id}>
                            <button
                                type="button"
                                className={isActive ? `${styles.item} ${styles.active}` : styles.item}
                                aria-current={isActive ? 'true' : undefined}
                                onClick={() => onSelectProject(project.id)}
                            >
                                <span className={styles.label}>{project.label}</span>
                                <span className={styles.count}>{project.count}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
