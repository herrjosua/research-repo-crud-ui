import { useState } from 'react';
import { Grid, Column, Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import BreadcrumbBar from './shell/BreadcrumbBar';
import LeftRail from './rails/LeftRail';
import ChatPanel from './chat/ChatPanel';
import { PROJECTS } from './mock/constants';
import { CONVERSATIONS } from './mock/conversations';
import styles from './AskTheRepo.module.scss';

// Order here drives both the Tab/TabPanel pairing (Carbon's Tabs matches
// them up by index) and Tabs' own controlled `selectedIndex`.
const VIEWS = ['ask', 'insights'];

export default function AskTheRepo() {
    const [activeView, setActiveView] = useState('ask');
    // Lives here, not inside LeftRail: ChatPanel (below) reads the same
    // active-conversation/-project state the rail writes to, so it can't
    // be local-only to the rail.
    const [activeProjectId, setActiveProjectId] = useState('all');
    const [activeConversationId, setActiveConversationId] = useState(null);

    // Mirrors AskView.tsx's handleSelectProject/handleSelectConv: picking a
    // project drops any open conversation (it may belong to a different
    // project), and opening a conversation re-syncs the project switcher to
    // that conversation's own project, so the two controls never disagree
    // about which project is active.
    function handleSelectProject(projectId) {
        setActiveProjectId(projectId);
        setActiveConversationId(null);
    }

    function handleSelectConversation(conversationId) {
        setActiveConversationId(conversationId);
        const conversation = CONVERSATIONS.find((conv) => conv.id === conversationId);
        if (conversation) setActiveProjectId(conversation.project);
    }

    return (
        // `styles.page`: this is the actual fix for the rail/ChatPanel
        // height-matching problem, replacing the JS (ResizeObserver +
        // useLayoutEffect) from the last two rounds entirely. That JS
        // approach kept only covering whichever specific interaction it
        // was tested against (a project switch, then separately the
        // rail's own collapse toggle) because the *real* problem was
        // never "which event fires a re-measurement" — it was that
        // nothing in this page's ancestor chain ever had a genuine,
        // non-auto height to stretch against in the first place. Once a
        // CSS Grid row's own height comes from *auto/intrinsic* sizing
        // (the default, and what every ancestor here was doing), any
        // item in it — even with `align-items: stretch` + `height: 100%`
        // — still contributes its own full, unclipped content size back
        // into that row's sizing, which is what let a tall chat
        // conversation balloon the whole row instead of scrolling inside
        // it. `align-items: stretch` only reliably produces a genuine
        // (non-auto) size for a *grid item's own children* to inherit via
        // `height: 100%` when the *row itself* already has a definite
        // height to stretch that item into — which requires the chain to
        // start from something real, not content-derived. `100dvh` here
        // is that anchor: see `styles.page` in AskTheRepo.module.scss for
        // the full chain this sets up (page → tabsGrid → tabsColumn →
        // tabPanel → the rail/content row), each link using `flex: 1` or
        // Grid's own default stretch to pass a real height to the next,
        // ending at LeftRail's `.rail` and ChatPanel's `.panel`, each of
        // which scrolls its own overflow internally
        // (`overflow-y: auto`) instead of growing the page.
        <div className={styles.page}>
            <BreadcrumbBar />
            {/* Same Grid/Column Dashboard.jsx wraps its whole page in (a full-
                width Column: sm=4/md=8/lg=16) — Carbon's Grid is what supplies
                the outer page margin there, and BreadcrumbBar wraps itself the
                same way. `Tabs` sits inside it rather than the tab bar getting
                its own flat `padding-inline`, so the tab bar's content lines up
                with the breadcrumb/banner above it and the rail/content below
                it at every breakpoint, not just approximately at one.

                `styles.tabsGrid`/`styles.tabsColumn`: `flex: 1` and a flex
                column respectively — the second link in `styles.page`'s
                chain (see the comment there). */}
            <Grid className={styles.tabsGrid}>
                <Column sm={4} md={8} lg={16} className={styles.tabsColumn}>
                    <Tabs
                        selectedIndex={VIEWS.indexOf(activeView)}
                        onChange={({ selectedIndex }) => setActiveView(VIEWS[selectedIndex])}
                    >
                        <TabList aria-label="Ask the Repo views" className={styles.tabList}>
                            <Tab>Ask</Tab>
                            <Tab>Saved Insights</Tab>
                        </TabList>
                        {/* `styles.tabPanel` on both: the active one is the
                            next link in the chain (flex: 1, filling
                            whatever `tabsColumn` leaves after TabList's own
                            natural height); the inactive one is inert —
                            Carbon hides it via `[hidden]`, and the CSS is
                            written `:not([hidden])` so it never fights that. */}
                        <TabPanels>
                            <TabPanel className={styles.tabPanel}>
                                {/* Nested Grid/Column split for the rail (lg=4/
                                    md=2/sm=4) + content (lg=12/md=6/sm=4) — same
                                    spans Dashboard.jsx uses for its own sidebar +
                                    content, giving the same inter-column gutter.
                                    `narrow`: this Grid is nested inside the outer
                                    Column above, which already supplies the page
                                    margin — without it, this inner Grid adds its
                                    own margin on top, pushing the rail 16px to the
                                    right of where Dashboard's sidebar actually
                                    sits. `narrow` is Carbon's own documented fix
                                    for exactly this ("hangs 16px into the gutter
                                    — useful for... alignment with... containers").

                                    `styles.railRow`: the last link before the
                                    row itself — `flex: 1` fills the active
                                    tabPanel's height, and Grid's own default
                                    `align-items: stretch` (no override needed
                                    now) makes the rail/content Columns below
                                    match each other's height correctly, by
                                    construction. */}
                                <Grid narrow className={styles.railRow}>
                                    <Column lg={4} md={2} sm={4}>
                                        <LeftRail
                                            projects={PROJECTS}
                                            activeProjectId={activeProjectId}
                                            onSelectProject={handleSelectProject}
                                            conversations={CONVERSATIONS}
                                            activeConversationId={activeConversationId}
                                            onSelectConversation={handleSelectConversation}
                                        />
                                    </Column>
                                    <Column lg={12} md={6} sm={4}>
                                        <ChatPanel projectId={activeProjectId} conversationId={activeConversationId} />
                                    </Column>
                                </Grid>
                            </TabPanel>
                            <TabPanel className={styles.tabPanel}>
                                {/* Saved insights content: a later ticket. */}
                                <p className={styles.placeholder}>Saved insights content ships in a later ticket.</p>
                            </TabPanel>
                        </TabPanels>
                    </Tabs>
                </Column>
            </Grid>
        </div>
    );
}
