import { render, screen } from '@testing-library/react';
import App from './App';
import { useMe, useDemoUsers } from './api/auth';

vi.mock('./api/auth', () => ({
    useMe: vi.fn(),
    useDemoUsers: vi.fn(),
}));

// Stand-ins so these tests cover only App's branching and the banner, not
// each screen's own data fetching.
vi.mock('./LoginForm', () => ({ default: () => <p>login form</p> }));
vi.mock('./DemoUserPicker', () => ({ default: () => <p>demo picker</p> }));
vi.mock('./Dashboard', () => ({ default: () => <p>dashboard</p> }));
vi.mock('./Header', () => ({ default: () => <p>header</p> }));

const DISCLAIMER_TITLE = 'Demonstration environment';

const sampleUsers = [
    { username: 'priya', displayName: 'Priya Patel', role: 'UX Researcher' },
];

const loggedOut = { isLoading: false, isError: true, refetch: vi.fn() };
const loggedIn = { isLoading: false, isError: false, data: { username: 'priya' }, refetch: vi.fn() };

afterEach(() => {
    vi.restoreAllMocks();
});

describe('App demo disclaimer', () => {
    it('shows the demo picker when demo users exist and nobody is logged in', () => {
        useMe.mockReturnValue(loggedOut);
        useDemoUsers.mockReturnValue({ isLoading: false, data: sampleUsers });

        render(<App />);

        expect(screen.getByText('demo picker')).toBeInTheDocument();
        expect(screen.queryByText('login form')).not.toBeInTheDocument();
    });

    it('shows the disclaimer above the dashboard when demo users exist and someone is logged in', () => {
        useMe.mockReturnValue(loggedIn);
        useDemoUsers.mockReturnValue({ isLoading: false, data: sampleUsers });

        render(<App />);

        const title = screen.getByText(DISCLAIMER_TITLE);
        expect(screen.getByText(/fictional sample data for a hypothetical organization/)).toBeInTheDocument();
        expect(screen.getByText(/Content resets automatically every hour\./)).toBeInTheDocument();
        // DOCUMENT_POSITION_FOLLOWING: the dashboard comes after the banner.
        expect(title.compareDocumentPosition(screen.getByText('dashboard')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('does not use a live region, so the banner is not announced on every login', () => {
        useMe.mockReturnValue(loggedIn);
        useDemoUsers.mockReturnValue({ isLoading: false, data: sampleUsers });

        render(<App />);

        expect(screen.getByText(DISCLAIMER_TITLE)).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows no disclaimer on the login screen when the demo-user list is empty', () => {
        useMe.mockReturnValue(loggedOut);
        useDemoUsers.mockReturnValue({ isLoading: false, data: [] });

        render(<App />);

        expect(screen.getByText('login form')).toBeInTheDocument();
        expect(screen.queryByText(DISCLAIMER_TITLE)).not.toBeInTheDocument();
    });

    it('shows no disclaimer on the dashboard when the demo-user list is empty', () => {
        useMe.mockReturnValue(loggedIn);
        useDemoUsers.mockReturnValue({ isLoading: false, data: [] });

        render(<App />);

        expect(screen.getByText('dashboard')).toBeInTheDocument();
        expect(screen.queryByText(DISCLAIMER_TITLE)).not.toBeInTheDocument();
    });

    it('shows no disclaimer when the demo-users request fails', () => {
        useMe.mockReturnValue(loggedIn);
        useDemoUsers.mockReturnValue({ isLoading: false, isError: true, data: undefined });

        render(<App />);

        expect(screen.getByText('dashboard')).toBeInTheDocument();
        expect(screen.queryByText(DISCLAIMER_TITLE)).not.toBeInTheDocument();
    });
});
