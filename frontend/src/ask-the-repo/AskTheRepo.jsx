import { useMemo, useRef, useState } from 'react';
import { Grid, Column, Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import { useQueryClient } from '@tanstack/react-query';
import BreadcrumbBar from './shell/BreadcrumbBar';
import LeftRail from './rails/LeftRail';
import ChatPanel from './chat/ChatPanel';
import { useAskRepo, latestAssistantMessage } from './chat/useAskRepo';
import { startersFor } from './chat/starters';
import { captureNote } from './chat/askCopy';
import SourcesPanel from './sources/SourcesPanel';
import SourceDetailModal from './sources/SourceDetailModal';
import SavedInsightsView from './insights/SavedInsightsView';
import { useSavedInsights } from './insights/useSavedInsights';
import { useAskConfig } from '../api/ask';
import styles from './AskTheRepo.module.scss';

// Order here drives both the Tab/TabPanel pairing (Carbon's Tabs matches
// them up by index) and Tabs' own controlled `selectedIndex`.
const VIEWS = ['ask', 'insights'];

// The project picker's no-filter entry. POST /api/ask treats "all" as the
// whole repo, cross-cutting records included.
const ALL_PROJECTS = 'all';

function toggleIn(set, id) {
    const next = new Set(set);
    if (next.has(id)) {
        next.delete(id);
    } else {
        next.add(id);
    }
    return next;
}

export default function AskTheRepo() {
    const queryClient = useQueryClient();
    const [activeView, setActiveView] = useState('ask');
    // Lives here, not inside LeftRail: ChatPanel (below) reads the same
    // active-conversation/-project state the rail writes to, so it can't
    // be local-only to the rail.
    const [activeProjectId, setActiveProjectId] = useState(ALL_PROJECTS);
    const [activeConversationId, setActiveConversationId] = useState(null);

    // GET /api/ask/config: whether this server can answer at all, and the
    // real project list (project-* tags with labels and record counts).
    // Until it loads, or if it fails, the picker shows only "All
    // projects", and a 503 from POST /api/ask still switches the tab to
    // "not available". While it's pending, ChatPanel shows neither mode's
    // questions (see its `configLoading`).
    const config = useAskConfig();
    const configProjects = useMemo(() => config.data?.projects ?? [], [config.data]);

    // Static mode (the public demo, config `mode: 'static'`): no model, so
    // visitors pick from the captured questions instead of typing. The
    // project picker filters them the way it filters live questions: "All
    // projects" lists every one, a project only its own (an exact match).
    // A project with no captured questions would have nothing to click, so
    // the picker leaves it out; "All projects" (and its count, which is the
    // whole corpus it searches) stays. Live mode lists every project, since
    // anything can be typed.
    const isStatic = config.data?.mode === 'static';
    const staticQuestions = useMemo(() => config.data?.questions ?? [], [config.data]);
    const projects = useMemo(() => {
        const total = configProjects.reduce((sum, project) => sum + project.count, 0);
        const withQuestions = new Set(staticQuestions.map((question) => question.project));
        return [
            { id: ALL_PROJECTS, label: 'All projects', count: configProjects.length > 0 ? total : undefined },
            ...(isStatic ? configProjects.filter((project) => withQuestions.has(project.id)) : configProjects),
        ];
    }, [configProjects, isStatic, staticQuestions]);
    const labelsById = useMemo(
        () => new Map(configProjects.map((project) => [project.id, project.label])),
        [configProjects]
    );
    // A tag the config doesn't list (it failed to load, or the record was
    // re-tagged since) shows no project at all rather than the raw
    // project-* tag; a saved insight from such a record still groups under
    // "Other" (see groupInsightsByProject).
    const projectLabelFor = (tag) => (tag ? labelsById.get(tag) ?? null : null);

    // Conversations, their messages, and the request behind each one. The
    // "active" assistant message the sources rail shows is derived, not
    // stored — always the latest reply in the open conversation, matching
    // AskView.tsx's `activeSources`.
    const ask = useAskRepo();
    const activeMessages = activeConversationId ? ask.getMessages(activeConversationId) : [];
    const activeRequest = activeConversationId ? ask.getRequest(activeConversationId) : null;
    const activeAssistantMessage = latestAssistantMessage(activeMessages);
    const unavailable = config.data?.enabled === false || ask.unavailable;

    // The active project's captured questions (static mode; see above).
    // `null` in live mode, which leaves ChatPanel's composer as it was.
    const pickerQuestions = useMemo(() => {
        if (!isStatic) return null;
        if (activeProjectId === ALL_PROJECTS) return staticQuestions;
        return staticQuestions.filter((question) => question.project === activeProjectId);
    }, [isStatic, staticQuestions, activeProjectId]);

    // Lifted in Story 6: the sources modal saves insights and the Saved
    // Insights tab reads/removes them. Session-only until v1.3.7.
    const { insights, savedSourceIds, toggleSourceInsight, removeInsight } = useSavedInsights();

    // The source detail modal lives here, not in the sources rail, because
    // an answer's inline [n] citations open it too. `openSource` is kept
    // after the modal closes, so the rail card it came from stays
    // highlighted and Carbon's close animation still has content.
    const [modal, setModal] = useState({ open: false, source: null });
    const launcherRef = useRef(null);
    const [pinnedIds, setPinnedIds] = useState(() => new Set());
    const openSource = modal.source;

    function handleOpenSource(source, event) {
        launcherRef.current = event.currentTarget;
        setModal({ open: true, source });
    }

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
        const conversation = ask.conversations.find((conv) => conv.id === conversationId);
        if (conversation) setActiveProjectId(conversation.project);
    }

    // Asking from the empty state starts a conversation in the active
    // project and opens it; asking inside one keeps its project.
    function handleSend(question) {
        const conversationId = ask.send(activeConversationId, activeProjectId, question);
        if (!activeConversationId) setActiveConversationId(conversationId);
    }

    // Static mode: the same flow, asked by the captured question's id.
    function handlePickQuestion(question) {
        const conversationId = ask.send(activeConversationId, activeProjectId, question.question, { questionId: question.id });
        if (!activeConversationId) setActiveConversationId(conversationId);
    }

    // A 401 means the session is gone. Refetching "me" gets the same 401,
    // which switches App to the login form.
    function handleSignIn() {
        queryClient.invalidateQueries({ queryKey: ['me'] });
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
        // start from something real, not content-derived, *and* every
        // Grid in the chain to declare that row (`grid-template-rows:
        // minmax(0, 1fr)` on `tabsGrid`/`railRow` — Carbon's Grid alone
        // gives an implicit `auto` row, which grew to fit a tall
        // conversation until that was added). The anchor is App.jsx's
        // `<main>` (App.module.scss's `.fillViewport`: viewport minus the
        // sticky footer, as a flex column), which this fills with
        // `flex: 1` so the demo banner App renders above it, when present,
        // is accounted for by layout rather than arithmetic. See
        // `styles.page` in AskTheRepo.module.scss for the full chain (main
        // → page → tabsGrid → tabsColumn → tabPanel → the rail/content
        // row), each link using `flex: 1` or Grid stretch into a definite
        // row to pass a real height to the next, ending at LeftRail's
        // `.rail`, ChatPanel's `.panel` and SourcesPanel's `.panel`, each
        // of which scrolls its own overflow internally (`overflow-y:
        // auto`) instead of growing the page.
        <div className={styles.page}>
            {/* The page's one h1, for screen reader navigation (axe's
                page-has-heading-one). Visually hidden: the breadcrumb's
                current-page crumb already shows the same name, and a
                visible heading would take height from the rail/chat row,
                which fills the viewport. */}
            <h1 className="cds--visually-hidden">Ask the Repo</h1>
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
                                {/* Nested Grid/Column split for the left rail (lg=4/
                                    md=2/sm=4) — the same span Dashboard.jsx uses for
                                    its own sidebar — then the chat panel (lg=8/md=4)
                                    and the sources rail (lg=4/md=2), which mirrors
                                    the left rail's span so the chat sits centered
                                    between two equal rails. All three share Grid's
                                    own inter-column gutter.
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
                                            projects={projects}
                                            activeProjectId={activeProjectId}
                                            onSelectProject={handleSelectProject}
                                            conversations={ask.conversations}
                                            activeConversationId={activeConversationId}
                                            onSelectConversation={handleSelectConversation}
                                            onNewChat={() => setActiveConversationId(null)}
                                        />
                                    </Column>
                                    <Column lg={8} md={4} sm={4}>
                                        <ChatPanel
                                            messages={activeMessages}
                                            starters={startersFor(activeProjectId)}
                                            status={activeRequest?.status}
                                            slow={activeRequest?.slow}
                                            error={activeRequest?.error}
                                            unavailable={unavailable}
                                            configLoading={config.isPending}
                                            announcement={ask.announcement}
                                            pickerQuestions={pickerQuestions}
                                            pickerNote={isStatic ? captureNote(config.data.capture) : ''}
                                            onPickQuestion={handlePickQuestion}
                                            onSend={handleSend}
                                            onRetry={() => ask.retry(activeConversationId)}
                                            onSignIn={handleSignIn}
                                            onOpenSource={handleOpenSource}
                                        />
                                    </Column>
                                    <Column lg={4} md={2} sm={4}>
                                        <SourcesPanel
                                            message={activeAssistantMessage}
                                            selectedSourceId={openSource?.id ?? null}
                                            onOpenSource={handleOpenSource}
                                            pinnedIds={pinnedIds}
                                            onTogglePin={(source) => setPinnedIds((prev) => toggleIn(prev, source.id))}
                                            projectLabelFor={projectLabelFor}
                                        />
                                    </Column>
                                </Grid>
                            </TabPanel>
                            <TabPanel className={styles.tabPanel}>
                                <SavedInsightsView insights={insights} projects={configProjects} onRemove={removeInsight} />
                            </TabPanel>
                        </TabPanels>
                    </Tabs>
                </Column>
            </Grid>
            <SourceDetailModal
                open={modal.open}
                source={openSource}
                projectLabel={projectLabelFor(openSource?.recordProject)}
                onClose={() => setModal((prev) => ({ ...prev, open: false }))}
                pinned={openSource ? pinnedIds.has(openSource.id) : false}
                onTogglePin={() => setPinnedIds((prev) => toggleIn(prev, openSource.id))}
                saved={openSource ? savedSourceIds.has(openSource.id) : false}
                onToggleSave={() => toggleSourceInsight(openSource)}
                launcherButtonRef={launcherRef}
            />
        </div>
    );
}
