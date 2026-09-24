import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditRecordForm from './EditRecordForm';
import { useMe, useUsers } from './api/auth';
import { useUpdateRecord } from './api/records';

vi.mock('./api/auth', () => ({
    useMe: vi.fn(),
    useUsers: vi.fn(),
}));

vi.mock('./api/records', () => ({
    useUpdateRecord: vi.fn(),
}));

// The real CKEditor pulls in a full rich-text editor instance that jsdom
// can't meaningfully render and that's irrelevant to the attribution-field
// behavior under test here.
vi.mock('@ckeditor/ckeditor5-react', () => ({
    CKEditor: () => <div>Mock CKEditor</div>,
}));

// Carbon's Dropdown scrolls the highlighted item into view on selection,
// an API jsdom doesn't implement.
beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
});

function renderWithQueryClient(ui) {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
    vi.restoreAllMocks();
});

const rawRecord = {
    id: 'raw:2026-01-01-example',
    kind: 'raw',
    title: 'Example session',
    status: 'raw',
    tags: ['onboarding'],
    rawContent: '# Example',
    researcher: 'Sam Okafor',
};

const componentRecord = {
    id: 'component:example',
    kind: 'component',
    title: 'Example component',
    status: 'final',
    tags: [],
    rawContent: '# Example',
};

describe('EditRecordForm — attribution field', () => {
    it('shows the existing attribution value disabled for a non-lead and resubmits it unchanged', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        useUsers.mockReturnValue({ data: [] });
        const mutate = vi.fn();
        useUpdateRecord.mockReturnValue({ mutate, isPending: false, isError: false });

        const user = userEvent.setup();
        renderWithQueryClient(<EditRecordForm record={rawRecord} onClose={vi.fn()} />);

        const field = await screen.findByLabelText('Researcher');
        expect(field).toBeDisabled();
        expect(field).toHaveValue('Sam Okafor');

        await user.click(screen.getByRole('button', { name: /save changes/i }));

        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({
                frontmatter: expect.objectContaining({ researcher: 'Sam Okafor' }),
            }),
            expect.anything(),
        );
    });

    it('shows a reassignment dropdown for a lead and submits the newly chosen name', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Jordan Lee', is_lead: 1 } });
        useUsers.mockReturnValue({
            data: [
                { username: 'jordan', git_name: 'Jordan Lee' },
                { username: 'sam', git_name: 'Sam Okafor' },
                { username: 'priya', git_name: 'Priya Patel' },
            ],
        });
        const mutate = vi.fn();
        useUpdateRecord.mockReturnValue({ mutate, isPending: false, isError: false });

        const user = userEvent.setup();
        renderWithQueryClient(<EditRecordForm record={rawRecord} onClose={vi.fn()} />);

        const dropdown = await screen.findByRole('combobox', { name: 'Researcher' });
        await user.click(dropdown);
        await user.click(await screen.findByText('Priya Patel'));

        await user.click(screen.getByRole('button', { name: /save changes/i }));

        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({
                frontmatter: expect.objectContaining({ researcher: 'Priya Patel' }),
            }),
            expect.anything(),
        );
    });

    it('does not show any attribution field for a record kind with none (component)', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        useUsers.mockReturnValue({ data: [] });
        useUpdateRecord.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });

        renderWithQueryClient(<EditRecordForm record={componentRecord} onClose={vi.fn()} />);

        expect(screen.queryByLabelText('Researcher')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Designer')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Evaluator')).not.toBeInTheDocument();
    });
});

describe('EditRecordForm — save warning', () => {
    // Stand-in for useMutation's mutate: resolves straight to onSuccess with
    // the given PUT response body.
    const mutateResolvingTo = (data) => vi.fn((_vars, options) => options.onSuccess(data));

    it('passes the backend warning to onClose when PUT succeeds with one', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        useUsers.mockReturnValue({ data: [] });
        useUpdateRecord.mockReturnValue({
            mutate: mutateResolvingTo({ message: 'record updated…', warning: 'unknown tag "onbaording"' }),
            isPending: false,
            isError: false,
        });
        const onClose = vi.fn();

        const user = userEvent.setup();
        renderWithQueryClient(<EditRecordForm record={componentRecord} onClose={onClose} />);
        await user.click(screen.getByRole('button', { name: /save changes/i }));

        expect(onClose).toHaveBeenCalledWith('unknown tag "onbaording"');
    });

    it('passes no warning to onClose on a clean save', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        useUsers.mockReturnValue({ data: [] });
        useUpdateRecord.mockReturnValue({
            mutate: mutateResolvingTo({ message: 'updated, index refreshed, and change committed' }),
            isPending: false,
            isError: false,
        });
        const onClose = vi.fn();

        const user = userEvent.setup();
        renderWithQueryClient(<EditRecordForm record={componentRecord} onClose={onClose} />);
        await user.click(screen.getByRole('button', { name: /save changes/i }));

        expect(onClose).toHaveBeenCalledWith(undefined);
    });
});
