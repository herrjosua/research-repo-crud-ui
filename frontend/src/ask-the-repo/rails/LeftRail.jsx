import { useState } from 'react';
import { Button, IconButton } from '@carbon/react';
import { Add, Information, SidePanelClose, SidePanelOpen } from '@carbon/icons-react';
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
 * `conversations`: this session's conversations (`../chat/useAskRepo.js`;
 * `../fixtures/conversations.js` for the shape) — filtered here to the
 * active project before being handed to `ConversationList`. A
 * conversation started under `'all'` shows regardless of which project is
 * active, and every conversation shows when the active project itself is
 * `'all'`, matching `AskView.tsx`'s `filteredConvs` logic.
 *
 * `activeConversationId` / `onSelectConversation`: passed through to
 * `ConversationList`. `onNewChat()`: back to the empty state, in the
 * current project.
 *
 * "New chat", the project dropdown under it and the session-only footer
 * are pinned; Recent is the one scroll region between them. The dropdown
 * is one field tall however many projects there are (ten in the real
 * corpus), plus its record-count helper text in live mode (one line, and
 * two lines' height at the md floor whatever the count, so switching
 * projects doesn't move Recent), so Recent keeps the rest of the rail's
 * height.
 *
 * Conversations only last until the page is left, and the footer says so
 * in the Saved Insights tab's words. It's plain text with an icon, like
 * the sources rail's footer, rather than an InlineNotification: this rail
 * is as narrow as 136px at the md floor.
 */
export default function LeftRail({
    projects,
    activeProjectId,
    onSelectProject,
    conversations,
    activeConversationId,
    onSelectConversation,
    onNewChat,
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
                    <div className={styles.newChat}>
                        <Button kind="ghost" size="sm" renderIcon={Add} onClick={() => onNewChat()}>
                            New chat
                        </Button>
                    </div>
                    <ProjectSwitcher
                        projects={projects}
                        activeProjectId={activeProjectId}
                        onSelectProject={onSelectProject}
                    />
                    <div className={styles.divider} />
                    {/* The rail's only scroll region. Focusable so a keyboard
                        user can scroll it even with no rows to tab to. */}
                    <div
                        className={styles.scroll}
                        role="region"
                        aria-label="Recent conversations"
                        tabIndex={0}
                    >
                        <p className={styles.sectionLabel}>Recent</p>
                        <ConversationList
                            conversations={visibleConversations}
                            activeConversationId={activeConversationId}
                            onSelectConversation={onSelectConversation}
                        />
                    </div>
                    <p className={styles.footer}>
                        <Information size={16} aria-hidden="true" className={styles.footerIcon} />
                        Session only: conversations aren't saved yet — they stay here until you leave this page.
                    </p>
                </div>
            )}
        </aside>
    );
}
