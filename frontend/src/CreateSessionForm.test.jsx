import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreateSessionForm from './CreateSessionForm';
import { useMe, useUsers } from './api/auth';
import { useCreateSession } from './api/records';

vi.mock('./api/auth', () => ({
    useMe: vi.fn(),
    useUsers: vi.fn(),
}));

vi.mock('./api/records', () => ({
    useCreateSession: vi.fn(),
}));

// The real CKEditor pulls in a full rich-text editor instance that jsdom
// can't meaningfully render and that's irrelevant to the researcher-field
// behavior under test here.
vi.mock('@ckeditor/ckeditor5-react', () => ({
    CKEditor: () => <div>Mock CKEditor</div>,
}));

// Carbon's TextArea measures itself via ResizeObserver, and its Dropdown
// scrolls the highlighted item into view on selection — neither API exists
// in jsdom, so stub both to keep mounting/interacting with the form from
// throwing on APIs that have nothing to do with what's under test here.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
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

describe('CreateSessionForm — researcher attribution', () => {
    it('auto-fills researcher with the logged-in non-lead user, disabled, and submits it as-is', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        useUsers.mockReturnValue({ data: [] });
        const mutate = vi.fn();
        useCreateSession.mockReturnValue({ mutate, isPending: false, isError: false });

        const user = userEvent.setup();
        renderWithQueryClient(<CreateSessionForm onClose={vi.fn()} />);

        const researcherField = await screen.findByLabelText('Researcher');
        expect(researcherField).toBeDisabled();
        expect(researcherField).toHaveValue('Priya Patel');

        await user.type(screen.getByLabelText(/Title/), 'Some session');
        await user.selectOptions(screen.getByLabelText(/Type/), 'interview');
        await user.click(screen.getByRole('button', { name: /create session/i }));

        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({ researcher: 'Priya Patel' }),
            expect.anything(),
        );
    });

    it('shows a reassignment dropdown for a lead and submits the chosen researcher', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Jordan Lee', is_lead: 1 } });
        useUsers.mockReturnValue({
            data: [
                { username: 'jordan', git_name: 'Jordan Lee' },
                { username: 'priya', git_name: 'Priya Patel' },
            ],
        });
        const mutate = vi.fn();
        useCreateSession.mockReturnValue({ mutate, isPending: false, isError: false });

        const user = userEvent.setup();
        renderWithQueryClient(<CreateSessionForm onClose={vi.fn()} />);

        const dropdown = await screen.findByRole('combobox', { name: 'Researcher' });
        await user.click(dropdown);
        await user.click(await screen.findByText('Priya Patel'));

        await user.type(screen.getByLabelText(/Title/), 'Some session');
        await user.selectOptions(screen.getByLabelText(/Type/), 'interview');
        await user.click(screen.getByRole('button', { name: /create session/i }));

        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({ researcher: 'Priya Patel' }),
            expect.anything(),
        );
    });

    it('defaults a lead to themselves and submits that when they don\'t pick anyone', async () => {
        useMe.mockReturnValue({ data: { git_name: 'Jordan Lee', is_lead: 1 } });
        useUsers.mockReturnValue({
            data: [
                { username: 'jordan', git_name: 'Jordan Lee' },
                { username: 'priya', git_name: 'Priya Patel' },
            ],
        });
        const mutate = vi.fn();
        useCreateSession.mockReturnValue({ mutate, isPending: false, isError: false });

        const user = userEvent.setup();
        renderWithQueryClient(<CreateSessionForm onClose={vi.fn()} />);

        expect(await screen.findByRole('combobox', { name: 'Researcher' })).toHaveTextContent('Jordan Lee');

        await user.type(screen.getByLabelText(/Title/), 'Some session');
        await user.selectOptions(screen.getByLabelText(/Type/), 'interview');
        await user.click(screen.getByRole('button', { name: /create session/i }));

        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({ researcher: 'Jordan Lee' }),
            expect.anything(),
        );
    });

    it('fills in the researcher once the logged-in user finishes loading', () => {
        useMe.mockReturnValue({ data: undefined });
        useUsers.mockReturnValue({ data: [] });
        useCreateSession.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });

        const queryClient = new QueryClient();
        const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
        const { rerender } = render(<CreateSessionForm onClose={vi.fn()} />, { wrapper });
        expect(screen.getByLabelText('Researcher')).toHaveValue('');

        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        rerender(<CreateSessionForm onClose={vi.fn()} />);
        expect(screen.getByLabelText('Researcher')).toHaveValue('Priya Patel');
    });
});

describe('CreateSessionForm — validation', () => {
    function renderForm() {
        useMe.mockReturnValue({ data: { git_name: 'Priya Patel', is_lead: 0 } });
        useUsers.mockReturnValue({ data: [] });
        const mutate = vi.fn();
        useCreateSession.mockReturnValue({ mutate, isPending: false, isError: false });
        renderWithQueryClient(<CreateSessionForm onClose={vi.fn()} />);
        return mutate;
    }

    // The fields are `required`, and Carbon's Dropdown renders a native
    // <select required>. Without noValidate on the form the browser's own
    // check blocked the submit first, so none of this showed.
    it('shows the invalid fields and the summary when a required field is empty, and does not submit', async () => {
        const user = userEvent.setup();
        const mutate = renderForm();

        await user.click(screen.getByRole('button', { name: /create session/i }));

        expect(screen.getByText('Title is required.')).toBeInTheDocument();
        expect(screen.getByText('Choose a type.')).toBeInTheDocument();
        expect(screen.getByText('Please fix the highlighted fields')).toBeInTheDocument();
        expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true');
        expect(mutate).not.toHaveBeenCalled();
    });

    it('flags only the type when the title is filled in and no type is chosen', async () => {
        const user = userEvent.setup();
        const mutate = renderForm();

        await user.type(screen.getByLabelText(/^Title/), 'Home health interviews');
        await user.click(screen.getByRole('button', { name: /create session/i }));

        expect(screen.getByText('Choose a type.')).toBeInTheDocument();
        expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
        expect(screen.getByText('Please fix the highlighted fields')).toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalled();
    });

    it('still marks the required fields as required for assistive technology', () => {
        renderForm();

        expect(screen.getByLabelText(/^Title/)).toBeRequired();
        expect(screen.getByLabelText(/^Topic slug/)).toBeRequired();
    });
});
