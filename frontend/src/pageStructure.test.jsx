import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AskTheRepo from './ask-the-repo/AskTheRepo';
import { useAskConfig } from './api/ask';
import { useRecords } from './api/records';
import { startReader, stopReader, readAll } from './testUtils/virtualScreenReader';

// Page structure for a screen reader user (v1.3.6.63): which landmarks and
// headings there are, in what order, and the skip links that jump past the
// filter rail and the project picker. Read with the Virtual Screen Reader, so
// it follows the specs, not VoiceOver (see testUtils/virtualScreenReader.js).

vi.mock('./api/records', () => ({
    useRecords: vi.fn(),
    useRecord: vi.fn(),
    useDeleteRecord: vi.fn(),
    useRecordHistory: vi.fn(),
    useCreateSession: vi.fn(),
}));
vi.mock('./api/auth', () => ({
    useMe: () => ({ isLoading: false, isError: false, data: { git_name: 'Priya' } }),
    useDemoUsers: () => ({ isLoading: false, data: [] }),
    useUsers: () => ({ data: [] }),
    useLogout: () => ({ mutate: () => {} }),
}));
vi.mock('./api/ask', () => ({ askRepo: vi.fn(), useAskConfig: vi.fn() }));
vi.mock('./api/dev', () => ({ useDevProvider: vi.fn(), useSetDevProvider: vi.fn() }));
vi.mock('@ckeditor/ckeditor5-react', () => ({ CKEditor: () => <div>Mock CKEditor</div> }));

const RECORDS = [
    { id: 'a', kind: 'finding', title: 'Raw One', date: '2026-01-01', type: 'usability-test', tags: ['x'] },
    { id: 'b', kind: 'finding', title: 'Raw Two', date: '2026-01-02', type: 'synthesis', tags: [] },
];

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    useRecords.mockReturnValue({ isLoading: false, isError: false, data: RECORDS });
    useAskConfig.mockReturnValue({
        isPending: false,
        data: { enabled: true, mode: 'live', projects: [{ id: 'project-onboarding', label: 'Onboarding', count: 2 }] },
    });
});

afterEach(async () => {
    await stopReader();
    vi.restoreAllMocks();
});

function renderApp() {
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <App />
        </QueryClientProvider>,
    );
}

describe('page structure — Research Records', () => {
    it('puts the header in a banner outside main, and a skip link before everything', async () => {
        renderApp();
        await startReader();

        const spoken = await readAll();

        expect(spoken[1]).toBe('link, Skip to main content');
        const at = (phrase) => spoken.indexOf(phrase);
        expect(at('banner, UX Research Repo')).toBeLessThan(at('main'));
        expect(at('end of banner, UX Research Repo')).toBeLessThan(at('main'));
        expect(at('end of main')).toBeLessThan(at('contentinfo'));
    });

    it('offers "Skip to records" ahead of the filter rail, and the records come in a named region and a list', async () => {
        renderApp();
        await startReader();

        const spoken = await readAll();
        const at = (phrase) => spoken.indexOf(phrase);

        expect(at('link, Skip to records')).toBeGreaterThan(-1);
        expect(at('link, Skip to records')).toBeLessThan(at('complementary, Record filters'));
        expect(at('end of complementary, Record filters')).toBeLessThan(at('region, Research Records'));
        // The region's first stop is the page's h1, then the cards as a list of two.
        expect(spoken[at('region, Research Records') + 1]).toBe('heading, Research Records, level 1');
        expect(spoken[at('region, Research Records') + 2]).toBe('list');
        expect(spoken.filter((phrase) => phrase.startsWith('listitem, level 1, position') && phrase.endsWith('set size 2')))
            .toEqual(expect.arrayContaining(['listitem, level 1, position 1, set size 2', 'listitem, level 1, position 2, set size 2']));
    });

    it('has no empty list when no record matches', async () => {
        useRecords.mockReturnValue({ isLoading: false, isError: false, data: [] });
        renderApp();
        await startReader();

        const spoken = await readAll();
        const region = spoken.slice(spoken.indexOf('region, Research Records'), spoken.indexOf('end of region, Research Records'));

        expect(region).not.toContain('list');
    });

    it('moves focus to the main area and to the records heading from the skip links', async () => {
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole('link', { name: 'Skip to main content' }));
        expect(screen.getByRole('main')).toHaveFocus();

        await user.click(screen.getByRole('link', { name: 'Skip to records' }));
        expect(screen.getByRole('heading', { name: 'Research Records', level: 1 })).toHaveFocus();
    });
});

describe('page structure — Ask the Repo', () => {
    function renderAsk() {
        return render(
            <QueryClientProvider client={new QueryClient()}>
                <AskTheRepo />
            </QueryClientProvider>,
        );
    }

    it('offers "Skip to conversation" ahead of the project picker, and it lands on the Conversation region', async () => {
        const user = userEvent.setup();
        renderAsk();
        await startReader();

        const spoken = await readAll();
        const at = (phrase) => spoken.indexOf(phrase);

        expect(at('link, Skip to conversation')).toBeGreaterThan(-1);
        expect(at('link, Skip to conversation')).toBeLessThan(spoken.findIndex((phrase) => phrase.startsWith('combobox, Project')));

        await user.click(screen.getByRole('link', { name: 'Skip to conversation' }));
        expect(screen.getByRole('region', { name: 'Conversation' })).toHaveFocus();
    });
});
