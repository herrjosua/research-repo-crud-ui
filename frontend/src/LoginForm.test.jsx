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
    globalThis.fetch = vi.fn();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('LoginForm', () => {
    it('calls onLoginSuccess after a successful login', async () => {
        globalThis.fetch.mockResolvedValueOnce({
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
        globalThis.fetch.mockResolvedValueOnce({
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

    it('disables the button and shows pending text while the login request is in flight', async () => {
        // Instead of resolving immediately, capture the resolve function so we
        // can control exactly when the "server" responds — this is what lets us
        // catch the in-between (pending) state, rather than the mutation
        // resolving before we ever get a chance to check it.
        let resolveFetch;
        globalThis.fetch.mockImplementationOnce(
            () => new Promise((resolve) => { resolveFetch = resolve; }),
        );

        const user = userEvent.setup();
        renderWithQueryClient(<LoginForm onLoginSuccess={vi.fn()} />);

        await user.type(screen.getByLabelText('Username'), 'alice');
        await user.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple');
        await user.click(screen.getByRole('button', { name: /log in/i }));

        // findByRole (not getByRole) waits/retries — needed since the button's
        // text only changes to "Logging in…" once React Query flips isPending
        // to true, which happens asynchronously right after the click.
        const button = await screen.findByRole('button', { name: /logging in/i });
        expect(button).toBeDisabled();

        // Resolve the pending fetch now, so the mutation actually settles and
        // this test doesn't leave a dangling unresolved promise behind.
        resolveFetch({ ok: true, json: async () => ({ id: 1, username: 'alice' }) });
        await waitFor(() => expect(button).not.toBeDisabled());
    });
});