import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';
import RecordDetail from './RecordDetail';
import CreateSessionForm from './CreateSessionForm';
import AssistantMessage from './ask-the-repo/chat/AssistantMessage';
import ChatPanel from './ask-the-repo/chat/ChatPanel';
import QuestionPicker from './ask-the-repo/chat/QuestionPicker';
import ProjectSwitcher from './ask-the-repo/rails/ProjectSwitcher';
import { ERROR_COPY, LOADING_TEXT, SLOW_TEXT } from './ask-the-repo/chat/askCopy';
import { useRecords, useRecord, useDeleteRecord, useRecordHistory, useCreateSession } from './api/records';
import { useMe, useUsers } from './api/auth';
import { startReader, stopReader, readAll, readDialog, readUntil, lastSpoken } from './testUtils/virtualScreenReader';

// Screen reader coverage (RR-55, layer 1): what the Virtual Screen Reader
// speaks for the flows that were only checked with jsdom and axe. It follows
// the specs, not VoiceOver, so a manual VoiceOver pass still matters (see
// testUtils/virtualScreenReader.js for its limits).

vi.mock('./api/records', () => ({
    useRecords: vi.fn(),
    useRecord: vi.fn(),
    useDeleteRecord: vi.fn(),
    useRecordHistory: vi.fn(),
    useCreateSession: vi.fn(),
}));
vi.mock('./api/auth', () => ({ useMe: vi.fn(), useUsers: vi.fn() }));
vi.mock('@ckeditor/ckeditor5-react', () => ({ CKEditor: () => <div>Mock CKEditor</div> }));

// Stands in for the real forms and the record view, as in the component's own
// tests: each button simulates a successful PUT or DELETE with a warning.
vi.mock('./EditRecordForm', () => ({
    default: ({ onClose }) => (
        <div>
            <button onClick={() => onClose('unknown tag "onbaording"')}>Save with warning</button>
        </div>
    ),
}));

const record = {
    id: 'finding:example',
    kind: 'finding',
    title: 'Example finding',
    date: '2026-01-02',
    type: 'synthesis',
    tags: [],
    html: '<p>Body</p>',
};
const DIALOG = 'Example finding';

// Carbon's Modal and TextArea measure themselves with ResizeObserver, and the
// chat scrolls itself into view; neither exists in jsdom.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
    useRecord.mockReturnValue({ isLoading: false, isError: false, data: record });
    useDeleteRecord.mockReturnValue({ mutate: vi.fn(), isError: false });
    useRecordHistory.mockReturnValue({ isLoading: false, isError: false });
});

afterEach(async () => {
    await stopReader();
    vi.restoreAllMocks();
});

describe('screen reader — record detail modal', () => {
    it('announces the dialog and its title, then the record and its actions', async () => {
        render(<RecordDetail id={record.id} onClose={vi.fn()} onDeleted={vi.fn()} />);
        await startReader();

        const spoken = await readDialog(DIALOG);

        expect(spoken).toContain('dialog, Example finding, modal');
        expect(spoken).toContain('heading, Example finding, level 2');
        expect(spoken).toEqual(expect.arrayContaining(['button, Close', 'button, Edit', 'button, Delete', 'button, View history', 'Body']));
    });

    it('speaks the backend warning and puts the reader on Edit after a save with a warning', async () => {
        const user = userEvent.setup();
        render(<RecordDetail id={record.id} onClose={vi.fn()} onDeleted={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: 'Edit' }));
        await startReader();

        await user.click(screen.getByRole('button', { name: 'Save with warning' }));

        expect(await lastSpoken()).toBe('button, Edit');
        // Focus moved the reader's cursor to Edit, below the warning. Start a
        // fresh pass to read the dialog from its top.
        await stopReader();
        await startReader();
        const spoken = await readDialog(DIALOG);
        expect(spoken).toEqual(expect.arrayContaining([
            'status',
            'Saved, but the index reported issues',
            'unknown tag "onbaording"',
        ]));
    });
});

describe('screen reader — delete with a warning', () => {
    it('puts the reader on the "Research Records" heading and speaks the warning', async () => {
        useRecords.mockReturnValue({
            isLoading: false,
            isError: false,
            data: [{ id: record.id, kind: record.kind, title: 'Raw One', date: '2026-01-01', type: 'usability-test', tags: [] }],
        });
        // DELETE answers 200 with a warning when build_index.py reported issues.
        useDeleteRecord.mockReturnValue({
            mutate: (_id, { onSuccess }) => onSuccess({ warning: 'dangling related_findings link' }),
            isError: false,
        });
        const user = userEvent.setup();
        render(<Dashboard />);
        await user.click(screen.getByText('Raw One'));
        await user.click(screen.getByRole('button', { name: 'Delete' }));
        await startReader();

        await user.click(within(screen.getByRole('dialog', { name: 'Delete this record?' })).getByRole('button', { name: 'Delete' }));

        expect(await lastSpoken()).toBe('heading, Research Records, level 1');
        const spoken = await readAll();
        expect(spoken).toEqual(expect.arrayContaining([
            'status',
            'Deleted, but the index reported issues',
            'dangling related_findings link',
        ]));
    });
});

describe('screen reader — Create Session form', () => {
    const FORM = 'Create new research session';
    const readForm = () => readUntil((phrase) => phrase === `end of form, ${FORM}`);

    function renderForm(mutation = {}) {
        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        useUsers.mockReturnValue({ data: [] });
        useCreateSession.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, ...mutation });
        const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
        return render(
            <QueryClientProvider client={queryClient}>
                <CreateSessionForm onClose={vi.fn()} />
            </QueryClientProvider>,
        );
    }

    it('speaks the backend error from a rejected create', async () => {
        renderForm({ isError: true, error: new Error('topic_slug must be lowercase kebab-case') });
        await startReader();

        const spoken = await readForm();

        expect(spoken).toEqual(expect.arrayContaining([
            `form, ${FORM}`,
            'status',
            'Failed to create session',
            'topic_slug must be lowercase kebab-case',
        ]));
    });
});

describe('screen reader — Ask tab', () => {
    const SOURCE = {
        id: 'raw:a#1', kind: 'interview', title: 'Checkout Usability Study — Wave 2',
        excerpt: '…', project: null, recordProject: null, date: 'Aug 14, 2026',
    };
    const STARTERS = ['What did coders think of the AI billing code suggestions?'];

    function renderPanel(props = {}) {
        return render(
            <ChatPanel
                messages={[]}
                starters={STARTERS}
                onSend={() => {}}
                onRetry={() => {}}
                onSignIn={() => {}}
                onOpenSource={() => {}}
                {...props}
            />,
        );
    }

    it('names each citation button for the source it opens, and says it opens a dialog', async () => {
        render(
            <AssistantMessage
                message={{ id: 'm1', role: 'assistant', content: 'Friction is the top complaint [1].', sources: [SOURCE], timestamp: '14:02' }}
                saved={false}
                onToggleSave={() => {}}
                onOpenSource={() => {}}
            />,
        );
        await startReader();

        const spoken = await readAll();

        expect(spoken).toContain('button, Source 1: Checkout Usability Study — Wave 2, has popup dialog');
    });

    it('exposes the conversation as a labeled region and the answer announcement as a live region', async () => {
        renderPanel({ announcement: 'Answer received, 2 sources cited.' });
        await startReader();

        const spoken = await readAll();

        expect(spoken).toContain('region, Conversation');
        expect(spoken).toContain('Answer received, 2 sources cited.');
        // Not the answer itself: only a count is announced (RR-55 open decision).
        expect(screen.getByText('Answer received, 2 sources cited.')).toHaveAttribute('aria-live', 'polite');
    });

    it('speaks the searching line, and the slow-start hint with it', async () => {
        renderPanel({ status: 'loading', slow: true });
        await startReader();

        const spoken = await readAll();

        expect(spoken).toEqual(expect.arrayContaining([LOADING_TEXT, SLOW_TEXT]));
    });

    it.each(['model', 'session', 'unknown'])('speaks the %s error title and message in a single status notification', async (kind) => {
        renderPanel({ status: 'error', error: { kind, question: 'Q', project: null } });
        await startReader();

        const spoken = await readAll();

        // Whether a real screen reader also reads the panel's own live region
        // for the same failure (a double read) can't be seen here; that is
        // still a manual VoiceOver check (RR-55).
        const { title, subtitle } = ERROR_COPY[kind];
        expect(spoken.filter((phrase) => phrase === title)).toHaveLength(1);
        expect(spoken.filter((phrase) => phrase === subtitle)).toHaveLength(1);
        expect(spoken).toContain('status');
    });
});

describe('screen reader — Carbon dropdown pickers', () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = () => {};
    });

    // Carbon's chevron is labelled "Open menu" / "Close menu"; the pickers hide it
    // (src/carbonDropdown.js) because the combobox already says it can be opened.
    const hasMenuLabel = (spoken) => spoken.some((phrase) => /(open|close) menu/i.test(phrase));

    it('reads the project switcher as one labelled combobox, without "Open menu"', async () => {
        const projects = [
            { id: 'all', label: 'All Projects', count: 247 },
            { id: 'checkout', label: 'Checkout Redesign', count: 84 },
        ];
        render(<ProjectSwitcher projects={projects} activeProjectId="checkout" onSelectProject={vi.fn()} />);
        await startReader();

        const spoken = await readAll();

        expect(spoken.some((phrase) => phrase.startsWith('combobox, Project'))).toBe(true);
        expect(spoken).toContain('Checkout Redesign');
        expect(hasMenuLabel(spoken)).toBe(false);
    });

    it('reads the question picker as one labelled combobox, without "Open menu"', async () => {
        render(<QuestionPicker questions={[{ id: 'q1', question: 'What slows onboarding?', project: 'all' }]} onPick={vi.fn()} />);
        await startReader();

        const spoken = await readAll();

        expect(spoken.some((phrase) => phrase.startsWith('combobox'))).toBe(true);
        expect(hasMenuLabel(spoken)).toBe(false);
    });
});
