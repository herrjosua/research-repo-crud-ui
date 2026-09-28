import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LeftRail from './LeftRail';

const PROJECTS = [
    { id: 'all', label: 'All Projects', count: 3 },
    { id: 'checkout', label: 'Checkout Redesign', count: 2 },
    { id: 'onboarding', label: 'Onboarding v3', count: 1 },
];

const CONVERSATIONS = [
    { id: 'c1', title: 'Pain points in checkout flow', project: 'checkout', lastMessage: '…', time: '2m' },
    { id: 'c2', title: 'Onboarding drop-off reasons', project: 'onboarding', lastMessage: '…', time: '1h' },
    { id: 'c3', title: 'Search intent patterns', project: 'all', lastMessage: '…', time: 'Mon' },
];

// Carbon's Dropdown (the project picker) scrolls its highlighted option
// into view (Element.scrollIntoView — missing in jsdom). Same stub as
// CreateSessionForm.test.jsx.
beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
});

function renderRail(props = {}) {
    return render(
        <LeftRail
            projects={PROJECTS}
            activeProjectId="all"
            onSelectProject={() => {}}
            conversations={CONVERSATIONS}
            activeConversationId={null}
            onSelectConversation={() => {}}
            onNewChat={() => {}}
            {...props}
        />
    );
}

describe('LeftRail', () => {
    it('shows every conversation when the active project is "all"', () => {
        renderRail({ activeProjectId: 'all' });

        expect(screen.getByRole('button', { name: /Pain points in checkout flow/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Onboarding drop-off reasons/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Search intent patterns/ })).toBeInTheDocument();
    });

    it('filters the conversation list to the active project, plus project-agnostic ("all") conversations', () => {
        renderRail({ activeProjectId: 'checkout' });

        expect(screen.getByRole('button', { name: /Pain points in checkout flow/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Search intent patterns/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Onboarding drop-off reasons/ })).not.toBeInTheDocument();
    });

    it('forwards project selection to onSelectProject', async () => {
        const user = userEvent.setup();
        const onSelectProject = vi.fn();
        renderRail({ onSelectProject });

        await user.click(screen.getByRole('combobox', { name: /Project/ }));
        await user.click(screen.getByRole('option', { name: /Checkout Redesign/ }));

        expect(onSelectProject).toHaveBeenCalledWith('checkout');
    });

    it('forwards conversation selection to onSelectConversation', async () => {
        const user = userEvent.setup();
        const onSelectConversation = vi.fn();
        renderRail({ onSelectConversation });

        await user.click(screen.getByRole('button', { name: /Search intent patterns/ }));

        expect(onSelectConversation).toHaveBeenCalledWith('c3');
    });

    it('scrolls only Recent, as a keyboard-reachable region, with New chat, the picker and the footer pinned outside it', async () => {
        const user = userEvent.setup();
        renderRail();

        const region = screen.getByRole('region', { name: 'Recent conversations' });
        expect(within(region).getByText('Recent')).toBeInTheDocument();
        expect(within(region).queryByRole('combobox')).not.toBeInTheDocument();
        expect(within(region).queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
        expect(within(region).queryByText(/Session only/)).not.toBeInTheDocument();

        await user.tab(); // collapse toggle
        await user.tab(); // New chat
        await user.tab(); // project picker
        expect(screen.getByRole('combobox', { name: /Project/ })).toHaveFocus();
        await user.tab();
        expect(region).toHaveFocus();
    });

    it('collapses and expands, hiding and restoring the picker and conversations', async () => {
        const user = userEvent.setup();
        renderRail();

        expect(screen.getByRole('combobox', { name: /Project/ })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Collapse rail' }));
        expect(screen.queryByRole('combobox', { name: /Project/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Recent conversations' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Expand rail' }));
        expect(screen.getByRole('combobox', { name: /Project/ })).toBeInTheDocument();
    });

    it('starts a new chat', async () => {
        const user = userEvent.setup();
        const onNewChat = vi.fn();
        renderRail({ onNewChat });

        await user.click(screen.getByRole('button', { name: 'New chat' }));

        expect(onNewChat).toHaveBeenCalledWith();
    });

    it('says conversations are session only', () => {
        renderRail();

        expect(screen.getByText(/Session only: conversations aren't saved yet/)).toBeInTheDocument();
    });

    it('shows the empty history text with no conversations', () => {
        renderRail({ conversations: [] });

        expect(screen.getByText('Questions you ask will appear here.')).toBeInTheDocument();
    });
});
