import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoUserPicker from './DemoUserPicker';
import { useDemoUsers, useDemoLogin } from './api/auth';

vi.mock('./api/auth', () => ({
    useDemoUsers: vi.fn(),
    useDemoLogin: vi.fn(),
}));

const sampleUsers = [
    { username: 'priya', displayName: 'Priya Patel', role: 'UX Researcher' },
    { username: 'sam', displayName: 'Sam Okafor', role: 'Product/UX Designer' },
    { username: 'jordan', displayName: 'Jordan Lee', role: 'Research Ops Lead' },
];

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DemoUserPicker', () => {
    it('renders a profile button for each demo user', () => {
        useDemoUsers.mockReturnValue({ data: sampleUsers });
        useDemoLogin.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });

        render(<DemoUserPicker onLoginSuccess={vi.fn()} />);

        expect(screen.getByRole('button', { name: /Priya Patel/ })).toBeInTheDocument();
        expect(screen.getByText('UX Researcher')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sam Okafor/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBeInTheDocument();
    });

    it('calls demoLogin.mutate with the selected username, and onLoginSuccess on success', async () => {
        const mutate = vi.fn((username, { onSuccess }) => onSuccess());
        const onLoginSuccess = vi.fn();
        useDemoUsers.mockReturnValue({ data: sampleUsers });
        useDemoLogin.mockReturnValue({ mutate, isPending: false, isError: false });

        const user = userEvent.setup();
        render(<DemoUserPicker onLoginSuccess={onLoginSuccess} />);

        await user.click(screen.getByRole('button', { name: /Priya Patel/ }));

        expect(mutate).toHaveBeenCalledWith('priya', { onSuccess: expect.any(Function) });
        expect(onLoginSuccess).toHaveBeenCalledTimes(1);
    });

    it('disables every profile button while a demo login is pending', () => {
        useDemoUsers.mockReturnValue({ data: sampleUsers });
        useDemoLogin.mockReturnValue({ mutate: vi.fn(), isPending: true, isError: false });

        render(<DemoUserPicker onLoginSuccess={vi.fn()} />);

        expect(screen.getByRole('button', { name: /Priya Patel/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Sam Okafor/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBeDisabled();
    });

    it('shows an error notification when the demo login fails', () => {
        useDemoUsers.mockReturnValue({ data: sampleUsers });
        useDemoLogin.mockReturnValue({
            mutate: vi.fn(),
            isPending: false,
            isError: true,
            error: { message: 'demo user not seeded' },
        });

        render(<DemoUserPicker onLoginSuccess={vi.fn()} />);

        expect(screen.getByText("Couldn't log in")).toBeInTheDocument();
        expect(screen.getByText('demo user not seeded')).toBeInTheDocument();
    });

    it('renders no profile buttons when there are no demo users yet', () => {
        useDemoUsers.mockReturnValue({ data: undefined });
        useDemoLogin.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });

        render(<DemoUserPicker onLoginSuccess={vi.fn()} />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});