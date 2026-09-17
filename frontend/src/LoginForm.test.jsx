import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginForm from './LoginForm';

// React Query needs a QueryClient in context to work at all — a fresh one
// per test keeps tests fully isolated from each other's cached state.
// retry: false matters here specifically: without it, a failed mutation in
// the "shows the server error" test would silently retry a few times before
// actually reporting isError, making that test slow and flaky.
function renderWithQueryClient(ui) {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
    // client.js calls the real global fetch — replacing it with a mock means
    // no actual network request ever leaves these tests, and we control
    // exactly what "the server" says back.
    global.fetch = vi.fn();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('LoginForm', () => {
    it('calls onLoginSuccess after a successful login', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 1, username: 'alice' }),
        });

        const onLoginSuccess = vi.fn();
        const user = userEvent.setup();
        renderWithQueryClient(<LoginForm onLoginSuccess={onLoginSuccess} />);

        await user.type(screen.getByLabelText('Username'), 'alice');
        await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple');
        await user.click(screen.getByRole('button', { name: /log in/i }));

        await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(/login failed/i)).not.toBeInTheDocument();
    });

    it('shows the server error message and does not call onLoginSuccess on failure', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ error: 'invalid username or password' }),
        });

        const onLoginSuccess = vi.fn();
        const user = userEvent.setup();
        renderWithQueryClient(<LoginForm onLoginSuccess={onLoginSuccess} />);

        await user.type(screen.getByLabelText('Username'), 'alice');
        await user.type(screen.getByLabelText('Password'), 'wrong-password');
        await user.click(screen.getByRole('button', { name: /log in/i }));

        // findBy* (unlike getBy*) waits and retries — needed here since the
        // error notification only appears after the mocked fetch's promise
        // resolves, which happens asynchronously after the click.
        expect(await screen.findByText('invalid username or password')).toBeInTheDocument();
        expect(onLoginSuccess).not.toHaveBeenCalled();
    });
});