import { useState } from 'react';
import { Grid, Column, Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import BreadcrumbBar from './shell/BreadcrumbBar';
import LeftRail from './rails/LeftRail';
import { PROJECTS } from './mock/constants';
import { CONVERSATIONS } from './mock/conversations';
import styles from './AskTheRepo.module.scss';

// Order here drives both the Tab/TabPanel pairing (Carbon's Tabs matches
// them up by index) and Tabs' own controlled `selectedIndex`.
const VIEWS = ['ask', 'insights'];

export default function AskTheRepo() {
    const [activeView, setActiveView] = useState('ask');
    // Lives here, not inside LeftRail: once Story 4 builds the chat panel,
    // it needs to read the same active-conversation/-project state the
    // rail writes to, so it can't be local-only to the rail.
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
        <div>
            <BreadcrumbBar />
            {/* Same Grid/Column Dashboard.jsx wraps its whole page in (a full-
                width Column: sm=4/md=8/lg=16) — Carbon's Grid is what supplies
                the outer page margin there, and BreadcrumbBar wraps itself the
                same way. `Tabs` sits inside it rather than the tab bar getting
                its own flat `padding-inline`, so the tab bar's content lines up
                with the breadcrumb/banner above it and the rail/content below
                it at every breakpoint, not just approximately at one. */}
            <Grid>
                <Column sm={4} md={8} lg={16}>
                    <Tabs
                        selectedIndex={VIEWS.indexOf(activeView)}
                        onChange={({ selectedIndex }) => setActiveView(VIEWS[selectedIndex])}
                    >
                        <TabList aria-label="Ask the Repo views" className={styles.tabList}>
                            <Tab>Ask</Tab>
                            <Tab>Saved Insights</Tab>
                        </TabList>
                        <TabPanels>
                            <TabPanel>
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
                                    — useful for... alignment with... containers"). */}
                                <Grid narrow>
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
                                        {/* Chat content: a later ticket. */}
                                        <p className={styles.placeholder}>Chat content ships in a later ticket.</p>
                                    </Column>
                                </Grid>
                            </TabPanel>
                            <TabPanel>
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
