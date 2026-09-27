import { useState } from 'react';
import { IconButton } from '@carbon/react';
import { SidePanelClose, SidePanelOpen } from '@carbon/icons-react';
import ProjectSwitcher from './ProjectSwitcher';
import ConversationList from './ConversationList';
import styles from './LeftRail.module.scss';

/**
 * Left rail of the Ask the Repo chat surface: the project switcher plus
 * the conversation history list beneath it, collapsible per the Direction
 * B v2 design (see `docs/Build_Direction_B_v2_Design_decomposed`'s
 * `AskView.tsx` `leftCollapsed` state) — reimplemented here on Carbon/SCSS
 * rather than porting that file's Tailwind/inline-style original.
 * Collapsed state is local UI state, not lifted to the caller: nothing
 * outside the rail needs to know whether it's collapsed — ChatPanel's own
 * height now comes entirely from the CSS chain in AskTheRepo.jsx/.scss
 * (`.page` → `.tabsGrid` → `.tabsColumn` → `.tabPanel` → `.railRow`, each
 * link handing a real height to the next via `flex: 1` or Grid's own
 * `align-items: stretch`), not from measuring this component, so this
 * doesn't need to report its own resizes to anyone anymore.
 *
 * `projects` / `activeProjectId` / `onSelectProject`: passed straight
 * through to `ProjectSwitcher`.
 *
 * `conversations`: the full list (`../mock/conversations.js`'s
 * `CONVERSATIONS` shape) — filtered here to the active project before
 * being handed to `ConversationList`. A conversation tagged project
 * `'all'` shows regardless of which project is active, and every
 * conversation shows when the active project itself is `'all'`, matching
 * `AskView.tsx`'s `filteredConvs` logic.
 *
 * `activeConversationId` / `onSelectConversation`: passed through to
 * `ConversationList`.
 */
export default function LeftRail({
    projects,
    activeProjectId,
    onSelectProject,
    conversations,
    activeConversationId,
    onSelectConversation,
}) {
    const [collapsed, setCollapsed] = useState(false);

    const visibleConversations = activeProjectId === 'all'
        ? conversations
        : conversations.filter((conv) => conv.project === activeProjectId || conv.project === 'all');

    return (
        <aside className={collapsed ? `${styles.rail} ${styles.collapsed}` : styles.rail}>
            <div className={styles.header}>
                <IconButton
                    label={collapsed ? 'Expand rail' : 'Collapse rail'}
                    kind="ghost"
                    size="sm"
                    onClick={() => setCollapsed((wasCollapsed) => !wasCollapsed)}
                >
                    {collapsed ? <SidePanelOpen size={16} /> : <SidePanelClose size={16} />}
                </IconButton>
            </div>
            {!collapsed && (
                <div className={styles.body}>
                    <ProjectSwitcher
                        projects={projects}
                        activeProjectId={activeProjectId}
                        onSelectProject={onSelectProject}
                    />
                    <div className={styles.divider} />
                    <div className={styles.conversations}>
                        <p className={styles.sectionLabel}>Recent</p>
                        <ConversationList
                            conversations={visibleConversations}
                            activeConversationId={activeConversationId}
                            onSelectConversation={onSelectConversation}
                        />
                    </div>
                </div>
            )}
        </aside>
    );
}
