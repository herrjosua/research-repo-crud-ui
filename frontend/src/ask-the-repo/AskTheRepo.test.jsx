import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AskTheRepo from './AskTheRepo';
import { askRepo, useAskConfig } from '../api/ask';
import { useDevProvider, useSetDevProvider } from '../api/dev';
import { STARTERS } from './chat/starters';
import { TOGGLE_LABEL } from './dev/devProviderCopy';

vi.mock('../api/ask', () => ({ askRepo: vi.fn(), useAskConfig: vi.fn() }));
// The dev-only provider toggle. Vitest runs with import.meta.env.DEV true,
// so AskTheRepo loads it; by default the backend has no dev routes (a 404),
// so it renders nothing, as in e2e and on any server without DEV_TOOLS_ENABLED.
vi.mock('../api/dev', () => ({ useDevProvider: vi.fn(), useSetDevProvider: vi.fn() }));

const CONFIG = {
    enabled: true,
    mode: 'live',
    projects: [
        { id: 'project-prior-auth', label: 'AI-Assisted Prior Authorization', count: 5 },
        { id: 'project-onboarding', label: 'Onboarding', count: 21 },
        { id: 'project-cross-cutting', label: 'Cross-cutting', count: 25 },
    ],
};

const V1 = { id: 'raw:v1#2', kind: 'transcript', title: 'Usability Test — Prior Auth v1', excerpt: 'Drafts cited outdated diagnosis codes.', project: null, recordProject: 'project-prior-auth', date: 'Apr 8, 2025', contextBefore: null, contextAfter: null, section: 'Key Findings' };
const FINDING = { id: 'finding:prior-auth#0', kind: 'synthesis', title: 'AI-Assisted Prior Authorization', excerpt: 'Nurses wanted the chart text behind each suggestion.', project: null, recordProject: 'project-prior-auth', date: null, contextBefore: null, contextAfter: null, section: null };
const V2 = { id: 'raw:v2#1', kind: 'transcript', title: 'Usability Test — Prior Auth v2', excerpt: 'The outdated code issue did not recur.', project: null, recordProject: null, date: 'Nov 4, 2025', contextBefore: null, contextAfter: null, section: null };

const FIRST_ANSWER = { answer: 'Drafts cited outdated codes [1].\n\nNurses wanted the chart text [2].', sources: [V1, FINDING], model: 'gemma2:9b' };
const SECOND_ANSWER = { answer: 'In v2 the issue did not recur [1].', sources: [V2], model: 'gemma2:9b' };

function httpError(status) {
    return Object.assign(new Error(`status ${status}`), { status });
}

let queryClient;

function renderPage() {
    queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries');
    return render(
        <QueryClientProvider client={queryClient}>
            <AskTheRepo />
        </QueryClientProvider>
    );
}

const composer = () => screen.getByLabelText('Ask a question about the research');
const rail = () => screen.getByRole('complementary', { name: 'Sources' });
const projectPicker = () => screen.getByRole('combobox', { name: /Project/ });

async function pickProject(user, name) {
    await user.click(projectPicker());
    await user.click(screen.getByRole('option', { name }));
}

async function projectOptions(user) {
    await user.click(projectPicker());
    return screen.getAllByRole('option').map((option) => option.textContent);
}

async function ask(user, question) {
    await user.type(composer(), question);
    await user.click(screen.getByRole('button', { name: 'Send' }));
}

// ChatPanel mounts a Composer (Carbon's TextArea, which measures itself via
// ResizeObserver — no such API in jsdom) and scrolls its message list into
// view on mount (Element.scrollIntoView — also missing in jsdom). Same stubs
// as CreateSessionForm.test.jsx, for the same reason.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    vi.mocked(useAskConfig).mockReturnValue({ data: CONFIG });
    vi.mocked(askRepo).mockReset();
    vi.mocked(useDevProvider).mockReturnValue({ data: undefined, isError: true });
    vi.mocked(useSetDevProvider).mockReturnValue({ mutateAsync: vi.fn() });
});

describe('AskTheRepo', () => {
    it('opens on the Ask tab with the "all" starters and an empty history', () => {
        renderPage();

        expect(screen.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Try asking')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: STARTERS.all[0] })).toBeInTheDocument();
        expect(screen.getByText('Questions you ask will appear here.')).toBeInTheDocument();
    });

    it('lists "All projects" and then the config\'s projects, by label', async () => {
        const user = userEvent.setup();
        renderPage();

        expect(projectPicker()).toHaveTextContent('All projects');
        expect(await projectOptions(user)).toEqual([
            'All projects',
            'AI-Assisted Prior Authorization',
            'Onboarding',
            'Cross-cutting',
        ]);
    });

    it('says how many records the selected project searches, totalling the projects for "All projects"', async () => {
        const user = userEvent.setup();
        renderPage();

        expect(projectPicker()).toHaveAccessibleDescription('Searches all 51 records');

        await pickProject(user, 'Onboarding');
        expect(projectPicker()).toHaveAccessibleDescription('Searches 21 records');
        expect(screen.getByText('Searches 21 records')).toBeInTheDocument();
    });

    it('shows only "All projects", with no record count, when the corpus has no project list', async () => {
        const user = userEvent.setup();
        vi.mocked(useAskConfig).mockReturnValue({ data: { enabled: true, mode: 'live', projects: [] } });
        renderPage();

        expect(await projectOptions(user)).toEqual(['All projects']);
        expect(screen.queryByText(/Searches/)).not.toBeInTheDocument();
    });

    it('starts the picker on "All projects" alone, and keeps it selected once the config loads', async () => {
        const user = userEvent.setup();
        vi.mocked(useAskConfig).mockReturnValue({ data: undefined, isPending: true });
        const { rerender } = renderPage();
        expect(projectPicker()).toHaveTextContent('All projects');

        vi.mocked(useAskConfig).mockReturnValue({ data: CONFIG });
        rerender(
            <QueryClientProvider client={queryClient}>
                <AskTheRepo />
            </QueryClientProvider>
        );

        expect(projectPicker()).toHaveTextContent('All projects');
        expect(await projectOptions(user)).toHaveLength(4);
        expect(screen.getByRole('option', { name: 'All projects' })).toHaveAttribute('aria-selected', 'true');
    });

    it('switches between the Ask and Saved Insights tabs', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));
        expect(screen.getByRole('tabpanel')).toHaveTextContent('No saved insights yet');
        // Carbon's TabPanels keeps unselected panels mounted with a `hidden`
        // attribute rather than removing them.
        expect(screen.getByText('Try asking')).not.toBeVisible();

        await user.click(screen.getByRole('tab', { name: 'Ask' }));
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Try asking');
    });

    it('asks from the empty state, starting a conversation that shows the answer and its sources', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();

        await ask(user, 'What made the drafts hard to review?');

        expect(askRepo).toHaveBeenCalledWith({ question: 'What made the drafts hard to review?', project: 'all' }, expect.anything());
        expect(await screen.findByRole('button', { name: `Source 1: ${V1.title}` })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /What made the drafts hard to review\?.*Drafts cited outdated codes\./ })).toHaveAttribute('aria-current', 'true');
        expect(within(rail()).getAllByRole('article')).toHaveLength(2);
        // Project labels come from the config, looked up by recordProject;
        // the finding has no date.
        expect(within(rail()).getByText('AI-Assisted Prior Authorization · Apr 8, 2025')).toBeInTheDocument();
        expect(within(rail()).getByText('AI-Assisted Prior Authorization', { selector: 'p' })).toBeInTheDocument();
    });

    it('opens a citation\'s source in the modal and saves it as an insight, grouped by its project', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await ask(user, 'What made the drafts hard to review?');

        await user.click(await screen.findByRole('button', { name: `Source 1: ${V1.title}` }));
        const dialog = screen.getByRole('dialog');
        expect(dialog.closest('.cds--modal')).toHaveClass('is-visible');
        expect(within(dialog).getByRole('heading', { name: V1.title })).toBeInTheDocument();
        expect(within(dialog).getByText('AI-Assisted Prior Authorization')).toBeInTheDocument();

        await user.click(within(dialog).getByRole('button', { name: 'Save as insight' }));
        await user.click(within(dialog).getByRole('button', { name: 'Close' }));
        // The rail's card for the same source shows it was the one opened.
        expect(within(rail()).getAllByRole('article')[0].className).toMatch(/selected/);

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));
        const group = screen.getByRole('region', { name: 'AI-Assisted Prior Authorization' });
        expect(within(group).getByRole('heading', { name: V1.title })).toBeInTheDocument();

        // Removing it there clears the saved state in the modal.
        await user.click(within(group).getByRole('button', { name: 'Remove insight' }));
        await user.click(screen.getByRole('tab', { name: 'Ask' }));
        await user.click(within(rail()).getByRole('button', { name: V1.title }));
        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save as insight' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('puts insights from records with no project in "Other"', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(SECOND_ANSWER);
        renderPage();
        await ask(user, 'Did it recur?');

        await user.click(await screen.findByRole('button', { name: `Source 1: ${V2.title}` }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save as insight' }));
        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));

        expect(within(screen.getByRole('region', { name: 'Other' })).getByRole('heading', { name: V2.title })).toBeInTheDocument();
    });

    it('shows no project for a tag the config doesn\'t list, and groups its insight under "Other"', async () => {
        const user = userEvent.setup();
        const RETAGGED = { ...V1, recordProject: 'project-retired' };
        askRepo.mockResolvedValueOnce({ answer: 'Drafts cited outdated codes [1].', sources: [RETAGGED], model: 'gemma2:9b' });
        renderPage();
        await ask(user, 'What made the drafts hard to review?');

        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });
        expect(within(rail()).getByText(V1.date)).toBeInTheDocument();
        expect(screen.queryByText(/project-retired/)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: `Source 1: ${V1.title}` }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).queryByText(/project-retired/)).not.toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Save as insight' }));
        await user.click(within(dialog).getByRole('button', { name: 'Close' }));

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));
        expect(within(screen.getByRole('region', { name: 'Other' })).getByRole('heading', { name: V1.title })).toBeInTheDocument();
    });

    it('shows no project on sources when the config failed to load', async () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: undefined, isError: true });
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await ask(userEvent.setup(), 'What made the drafts hard to review?');

        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });
        expect(within(rail()).getByText(V1.date)).toBeInTheDocument();
        expect(screen.queryByText(/project-prior-auth/)).not.toBeInTheDocument();
    });

    it('opens an older reply\'s own source from its citation, while the rail follows the latest reply', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER).mockResolvedValueOnce(SECOND_ANSWER);
        renderPage();
        await ask(user, 'What made the drafts hard to review?');
        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });
        await ask(user, 'Did it recur in v2?');
        await screen.findByRole('button', { name: `Source 1: ${V2.title}` });

        expect(within(rail()).getAllByRole('article')).toHaveLength(1);
        expect(within(rail()).getByRole('button', { name: V2.title })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: `Source 2: ${FINDING.title}` }));
        expect(within(screen.getByRole('dialog')).getByRole('heading', { name: FINDING.title })).toBeInTheDocument();
        // Both questions stayed in the one conversation.
        expect(screen.getAllByRole('button', { name: /Drafts cited|What made/ }).filter((b) => b.getAttribute('aria-current'))).toHaveLength(1);
    });

    it('scopes questions to the picked project and shows that project\'s starters', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();

        await pickProject(user, /AI-Assisted Prior Authorization/);
        expect(screen.getByRole('button', { name: STARTERS['project-prior-auth'][0] })).toBeInTheDocument();

        await ask(user, 'What made the drafts hard to review?');
        expect(askRepo).toHaveBeenCalledWith({ question: 'What made the drafts hard to review?', project: 'project-prior-auth' }, expect.anything());
    });

    it('points to the composer for a project without checked starters, which stays selectable', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();

        await pickProject(user, /Onboarding/);

        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        expect(screen.getByText('No starter questions for this project yet. Ask anything below.')).toBeInTheDocument();
        await ask(user, 'Where do new users drop off?');
        expect(askRepo).toHaveBeenCalledWith({ question: 'Where do new users drop off?', project: 'project-onboarding' }, expect.anything());
    });

    it('goes back to the empty state with New chat, and reopens a conversation (and its project) from the rail', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await pickProject(user, /AI-Assisted Prior Authorization/);
        await ask(user, 'What made the drafts hard to review?');
        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });

        await user.click(screen.getByRole('button', { name: 'New chat' }));
        expect(screen.getByText('Try asking')).toBeInTheDocument();

        await pickProject(user, /All projects/);
        await user.click(screen.getByRole('button', { name: /What made the drafts hard to review\?/ }));
        expect(screen.getByRole('button', { name: `Source 1: ${V1.title}` })).toBeInTheDocument();
        expect(projectPicker()).toHaveTextContent('AI-Assisted Prior Authorization');
    });

    it('shows neither mode\'s questions, and a disabled composer, until the config loads', () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: undefined, isPending: true });
        const { rerender } = renderPage();

        expect(screen.getByText('Loading questions…')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: STARTERS.all[0] })).not.toBeInTheDocument();
        expect(screen.queryByText('Choose a question')).not.toBeInTheDocument();
        expect(composer()).toBeDisabled();

        vi.mocked(useAskConfig).mockReturnValue({ data: CONFIG, isPending: false });
        rerender(
            <QueryClientProvider client={queryClient}>
                <AskTheRepo />
            </QueryClientProvider>
        );

        expect(screen.queryByText('Loading questions…')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: STARTERS.all[0] })).toBeInTheDocument();
        expect(composer()).toBeEnabled();
    });

    it('falls back to live mode\'s starters and composer when the config fails to load', () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: undefined, isPending: false, isError: true });
        renderPage();

        expect(screen.queryByText('Loading questions…')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: STARTERS.all[0] })).toBeInTheDocument();
        expect(composer()).toBeEnabled();
    });

    it('shows "not available" up front when the config says so', () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: { enabled: false, mode: null, projects: [] } });
        renderPage();

        expect(screen.getByText("Ask the Repo isn't available here.")).toBeInTheDocument();
        expect(composer()).toBeDisabled();
        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: STARTERS.all[0] })).not.toBeInTheDocument();
    });

    it('switches to "not available" when a question gets a 503', async () => {
        const user = userEvent.setup();
        askRepo.mockRejectedValueOnce(httpError(503));
        renderPage();

        await ask(user, 'Anything?');

        expect(await screen.findByText("Ask the Repo isn't available here.")).toBeInTheDocument();
        expect(screen.getByText('Anything?', { selector: 'div' })).toBeInTheDocument();
        expect(composer()).toBeDisabled();

        // A new chat stays unavailable, without starters.
        await user.click(screen.getByRole('button', { name: 'New chat' }));
        expect(screen.getByText("Ask the Repo isn't available here.")).toBeInTheDocument();
        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
    });

    it('sends the user back to sign in after a 401', async () => {
        const user = userEvent.setup();
        askRepo.mockRejectedValueOnce(httpError(401));
        renderPage();
        await ask(user, 'Anything?');

        await user.click(await screen.findByRole('button', { name: 'Sign in again' }));

        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['me'] });
    });

    it('retries after a 502 and shows the answer', async () => {
        const user = userEvent.setup();
        askRepo.mockRejectedValueOnce(httpError(502)).mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await ask(user, 'What made the drafts hard to review?');

        expect(await screen.findByText("Couldn't get an answer.")).toBeInTheDocument();
        expect(composer()).toHaveValue('What made the drafts hard to review?');

        await user.click(screen.getByRole('button', { name: 'Try again' }));

        expect(await screen.findByRole('button', { name: `Source 1: ${V1.title}` })).toBeInTheDocument();
        expect(screen.queryByText("Couldn't get an answer.")).not.toBeInTheDocument();
        expect(screen.getAllByText('What made the drafts hard to review?', { selector: 'div' })).toHaveLength(1);
    });
});

// Static mode (the public demo): GET /api/ask/config says `mode: 'static'`
// and lists the captured questions; nothing can be typed.
const STATIC_QUESTIONS = [
    { id: 'all-prior-auth-tests', question: 'What did the prior auth usability tests find?', project: null },
    { id: 'all-documentation-burden', question: 'How much documentation burden do clinicians report?', project: null },
    { id: 'prior-auth-draft-review', question: 'What made the prior auth drafts hard to review?', project: 'project-prior-auth' },
    { id: 'prior-auth-time-savings', question: 'How much drafting time did the AI save?', project: 'project-prior-auth' },
    { id: 'cross-cutting-roadmap', question: 'What does the roadmap say about AI?', project: 'project-cross-cutting' },
];
const STATIC_CONFIG = {
    ...CONFIG,
    mode: 'static',
    questions: STATIC_QUESTIONS,
    capture: { model: 'llama3.1:8b', capturedAt: '2026-07-04T23:30:00.000Z' },
};
const STATIC_NOTE = 'Captured from a local model run (llama3.1:8b, Jul 4, 2026) on sample data.';
const staticBanner = () => screen.queryByText('Answers are pre-generated')?.closest('.cds--actionable-notification') ?? null;

describe('AskTheRepo in static mode', () => {
    const questionList = () => screen.queryAllByRole('button', { name: /\?$/ })
        .filter((button) => STATIC_QUESTIONS.some((q) => q.question === button.textContent))
        .map((button) => button.textContent);
    const questionDropdown = () => screen.getByRole('combobox', { name: 'Choose a question' });

    beforeEach(() => {
        vi.mocked(useAskConfig).mockReturnValue({ data: STATIC_CONFIG });
    });

    it('lists every captured question under "All projects", with no composer and the pre-generated banner built from the config capture', () => {
        renderPage();

        expect(screen.getByText('Choose a question')).toBeInTheDocument();
        expect(questionList()).toEqual(STATIC_QUESTIONS.map((q) => q.question));
        expect(staticBanner()).toHaveTextContent(STATIC_NOTE);
        expect(screen.queryByLabelText('Ask a question about the research')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        // The dropdown only replaces the composer once a conversation starts.
        expect(screen.queryByRole('combobox', { name: 'Choose a question' })).not.toBeInTheDocument();
    });

    it('filters the questions to the picked project, by exact match', async () => {
        const user = userEvent.setup();
        renderPage();

        await pickProject(user, /AI-Assisted Prior Authorization/);
        expect(questionList()).toEqual([
            'What made the prior auth drafts hard to review?',
            'How much drafting time did the AI save?',
        ]);

        await pickProject(user, /Cross-cutting/);
        expect(questionList()).toEqual(['What does the roadmap say about AI?']);

        await pickProject(user, /All projects/);
        expect(questionList()).toHaveLength(STATIC_QUESTIONS.length);
    });

    it('leaves projects with no captured questions out of the picker, keeping "All projects"', async () => {
        const user = userEvent.setup();
        renderPage();

        expect(await projectOptions(user)).toEqual([
            'All projects',
            'AI-Assisted Prior Authorization',
            'Cross-cutting',
        ]);
    });

    it('shows no record count, since nothing is searched', async () => {
        const user = userEvent.setup();
        renderPage();

        expect(projectPicker()).not.toHaveAttribute('aria-describedby');
        await pickProject(user, 'Cross-cutting');
        expect(projectPicker()).not.toHaveAttribute('aria-describedby');
        expect(screen.queryByText(/Searches/)).not.toBeInTheDocument();
    });

    it('keeps "All projects" alone when no captured question names a project', async () => {
        const user = userEvent.setup();
        vi.mocked(useAskConfig).mockReturnValue({
            data: { ...STATIC_CONFIG, questions: STATIC_QUESTIONS.filter((q) => q.project === null) },
        });
        renderPage();

        expect(await projectOptions(user)).toEqual(['All projects']);
    });

    it('says so when there are no questions at all, still showing the pre-generated banner', () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: { ...STATIC_CONFIG, questions: [] } });
        renderPage();

        expect(screen.getByText('No pre-generated questions for this project yet.')).toBeInTheDocument();
        expect(questionList()).toEqual([]);
        expect(staticBanner()).toHaveTextContent(STATIC_NOTE);
    });

    it('asks a picked question by its id, and answers it like a live question', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await pickProject(user, /AI-Assisted Prior Authorization/);

        await user.click(screen.getByRole('button', { name: 'What made the prior auth drafts hard to review?' }));

        expect(askRepo).toHaveBeenCalledTimes(1);
        expect(askRepo.mock.calls[0][0]).toMatchObject({ questionId: 'prior-auth-draft-review' });
        // The question is in the thread, and starts a conversation in the rail.
        expect(screen.getByText('What made the prior auth drafts hard to review?', { selector: 'div' })).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: `Source 1: ${V1.title}` })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /What made the prior auth drafts hard to review\?.*Drafts cited outdated codes\./ })).toHaveAttribute('aria-current', 'true');
        expect(within(rail()).getAllByRole('article')).toHaveLength(2);
        expect(screen.getByText('Answer received, 2 sources cited.', { exact: false })).toBeInTheDocument();
        // No slow-answer hint in static mode.
        expect(screen.queryByText(/can take up to 20 seconds/)).not.toBeInTheDocument();

        // The list is gone; the dropdown sits where the composer was, and
        // the banner stays above the thread.
        expect(screen.queryByRole('button', { name: 'How much drafting time did the AI save?' })).not.toBeInTheDocument();
        expect(questionDropdown()).toBeEnabled();
        expect(staticBanner()).toHaveTextContent(STATIC_NOTE);
        expect(screen.queryByLabelText('Ask a question about the research')).not.toBeInTheDocument();
    });

    it('asks by the clicked question\'s id when two captured questions share wording', async () => {
        const user = userEvent.setup();
        vi.mocked(useAskConfig).mockReturnValue({
            data: {
                ...STATIC_CONFIG,
                questions: [
                    { id: 'all-draft-review', question: 'What made the drafts hard to review?', project: null },
                    { id: 'prior-auth-draft-review', question: 'What made the drafts hard to review?', project: 'project-prior-auth' },
                ],
            },
        });
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();

        await user.click(screen.getAllByRole('button', { name: 'What made the drafts hard to review?' })[1]);

        expect(askRepo).toHaveBeenCalledTimes(1);
        expect(askRepo.mock.calls[0][0]).toMatchObject({ questionId: 'prior-auth-draft-review' });
        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });
    });

    it('asks another question from the dropdown in the same conversation, which lists the project\'s questions', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER).mockResolvedValueOnce(SECOND_ANSWER);
        renderPage();
        await pickProject(user, /AI-Assisted Prior Authorization/);
        await user.click(screen.getByRole('button', { name: 'What made the prior auth drafts hard to review?' }));
        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });

        await user.click(questionDropdown());
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'What made the prior auth drafts hard to review?',
            'How much drafting time did the AI save?',
        ]);
        await user.click(screen.getByRole('option', { name: 'How much drafting time did the AI save?' }));

        expect(askRepo.mock.calls[1][0]).toMatchObject({ questionId: 'prior-auth-time-savings' });
        expect(await screen.findByRole('button', { name: `Source 1: ${V2.title}` })).toBeInTheDocument();
        // Both questions stayed in the one conversation, and the field
        // is ready for the next pick.
        expect(screen.getAllByText(/What made the prior auth|How much drafting time/, { selector: 'div' })).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: /What made the prior auth drafts hard to review\?/ }).filter((b) => b.getAttribute('aria-current'))).toHaveLength(1);
        expect(questionDropdown()).toHaveTextContent('Choose a question');
    });

    it('opens a citation\'s source and saves it as an insight', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await user.click(screen.getByRole('button', { name: 'What did the prior auth usability tests find?' }));

        await user.click(await screen.findByRole('button', { name: `Source 1: ${V1.title}` }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: V1.title })).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Save as insight' }));
        await user.click(within(dialog).getByRole('button', { name: 'Close' }));

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));
        const group = screen.getByRole('region', { name: 'AI-Assisted Prior Authorization' });
        expect(within(group).getByRole('heading', { name: V1.title })).toBeInTheDocument();
    });

    it('goes back to the filtered list with New chat', async () => {
        const user = userEvent.setup();
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await pickProject(user, /Cross-cutting/);
        await user.click(screen.getByRole('button', { name: 'What does the roadmap say about AI?' }));
        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });

        await user.click(screen.getByRole('button', { name: 'New chat' }));

        expect(questionList()).toEqual(['What does the roadmap say about AI?']);
        expect(screen.queryByRole('combobox', { name: 'Choose a question' })).not.toBeInTheDocument();
    });

    it('leaves the capture details out of the banner when the config has none', () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: { ...STATIC_CONFIG, capture: undefined } });
        renderPage();

        expect(staticBanner()).toHaveTextContent('Captured from a local model run on sample data. To ask your own questions, run the project locally');
    });

    it('keeps live mode unchanged, even if a config carries questions', () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: { ...STATIC_CONFIG, mode: 'live' } });
        renderPage();

        expect(composer()).toBeEnabled();
        expect(screen.getByText('Try asking')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: STARTERS.all[0] })).toBeInTheDocument();
        expect(screen.queryByText('Choose a question')).not.toBeInTheDocument();
        expect(staticBanner()).toBeNull();
    });

});

describe('dev provider toggle', () => {
    const toggle = () => screen.findByRole('tablist', { name: TOGGLE_LABEL });

    it('is absent when the backend has no dev routes', async () => {
        renderPage();
        // Give the lazy import time to resolve before asserting absence.
        await screen.findByRole('button', { name: STARTERS.all[0] });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.queryByRole('tablist', { name: TOGGLE_LABEL })).not.toBeInTheDocument();
    });

    it('on a switch, clears the conversations and resets the project, keeping saved insights', async () => {
        const user = userEvent.setup();
        vi.mocked(useDevProvider).mockReturnValue({ data: { provider: 'ollama' } });
        const mutateAsync = vi.fn().mockImplementation(async () => {
            vi.mocked(useDevProvider).mockReturnValue({ data: { provider: 'static' } });
            return { provider: 'static' };
        });
        vi.mocked(useSetDevProvider).mockReturnValue({ mutateAsync });
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();

        await pickProject(user, /AI-Assisted Prior Authorization/);
        await ask(user, 'What made the drafts hard to review?');
        await user.click(await screen.findByRole('button', { name: `Source 1: ${V1.title}` }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save as insight' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
        await user.type(composer(), 'half-typed');

        await toggle();
        await user.click(screen.getByRole('tab', { name: 'Static' }));

        await screen.findByText(/Switched to pre-generated answers \(static\)\./);
        // The switch is the one thing announced: the chat's own live region
        // comes back empty rather than repeating the last answer's.
        const announcing = [...document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"]')]
            .filter((el) => el.textContent.trim());
        expect(announcing).toHaveLength(1);
        expect(announcing[0]).toHaveTextContent('Switched to pre-generated answers (static). Conversations were cleared.');
        expect(mutateAsync).toHaveBeenCalledWith('static');
        expect(screen.getByText('Questions you ask will appear here.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /What made the drafts/ })).not.toBeInTheDocument();
        expect(projectPicker()).toHaveTextContent('All projects');
        expect(screen.getByRole('button', { name: STARTERS.all[0] })).toBeInTheDocument();
        expect(composer()).toHaveValue('');
        expect(within(rail()).queryAllByRole('article')).toHaveLength(0);

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));
        const group = screen.getByRole('region', { name: 'AI-Assisted Prior Authorization' });
        expect(within(group).getByRole('heading', { name: V1.title })).toBeInTheDocument();
    });

    it('keeps the conversation when the switch fails', async () => {
        const user = userEvent.setup();
        vi.mocked(useDevProvider).mockReturnValue({ data: { provider: 'static' } });
        vi.mocked(useSetDevProvider).mockReturnValue({
            mutateAsync: vi.fn().mockRejectedValue(Object.assign(new Error("Ollama isn't reachable at http://localhost:11434"), { status: 502 })),
        });
        askRepo.mockResolvedValueOnce(FIRST_ANSWER);
        renderPage();
        await ask(user, 'What made the drafts hard to review?');
        await screen.findByRole('button', { name: `Source 1: ${V1.title}` });

        await toggle();
        await user.click(screen.getByRole('tab', { name: 'Live (Ollama)' }));

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't switch to live answers (Ollama)."));
        expect(screen.getByText('Provider not switched')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: `Source 1: ${V1.title}` })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /What made the drafts hard to review\?/ })).toBeInTheDocument();
    });
});
