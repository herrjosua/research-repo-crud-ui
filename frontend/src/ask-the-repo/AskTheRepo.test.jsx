import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AskTheRepo from './AskTheRepo';
import { askRepo, useAskConfig } from '../api/ask';
import { STARTERS } from './chat/starters';

vi.mock('../api/ask', () => ({ askRepo: vi.fn(), useAskConfig: vi.fn() }));

const CONFIG = {
    enabled: true,
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
});

describe('AskTheRepo', () => {
    it('opens on the Ask tab with the "all" starters and an empty history', () => {
        renderPage();

        expect(screen.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Try asking')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: STARTERS.all[0] })).toBeInTheDocument();
        expect(screen.getByText('Questions you ask will appear here.')).toBeInTheDocument();
    });

    it('lists "All projects" and then the config\'s projects, with counts', async () => {
        const user = userEvent.setup();
        renderPage();

        expect(projectPicker()).toHaveTextContent('All projects');
        expect(await projectOptions(user)).toEqual([
            'All projects, 51 records51',
            'AI-Assisted Prior Authorization, 5 records5',
            'Onboarding, 21 records21',
            'Cross-cutting, 25 records25',
        ]);
    });

    it('shows only "All projects", without a count, when the corpus has no project list', async () => {
        const user = userEvent.setup();
        vi.mocked(useAskConfig).mockReturnValue({ data: { enabled: true, projects: [] } });
        renderPage();

        expect(await projectOptions(user)).toEqual(['All projects']);
    });

    it('starts the picker on "All projects" alone, and keeps it selected once the config loads', async () => {
        const user = userEvent.setup();
        vi.mocked(useAskConfig).mockReturnValue({ data: undefined });
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
        expect(screen.getByRole('option', { name: /All projects/ })).toHaveAttribute('aria-selected', 'true');
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

    it('shows no starters for a project without checked ones', async () => {
        const user = userEvent.setup();
        renderPage();

        await pickProject(user, /Onboarding/);

        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
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

    it('shows "not available" up front when the config says so', () => {
        vi.mocked(useAskConfig).mockReturnValue({ data: { enabled: false, projects: [] } });
        renderPage();

        expect(screen.getByText("Ask the Repo isn't available here.")).toBeInTheDocument();
        expect(composer()).toBeDisabled();
        expect(screen.getByRole('button', { name: STARTERS.all[0] })).toBeDisabled();
    });

    it('switches to "not available" when a question gets a 503', async () => {
        const user = userEvent.setup();
        askRepo.mockRejectedValueOnce(httpError(503));
        renderPage();

        await ask(user, 'Anything?');

        expect(await screen.findByText("Ask the Repo isn't available here.")).toBeInTheDocument();
        expect(screen.getByText('Anything?', { selector: 'div' })).toBeInTheDocument();
        expect(composer()).toBeDisabled();
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
