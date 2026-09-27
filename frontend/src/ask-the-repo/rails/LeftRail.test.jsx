import { render, screen } from '@testing-library/react';
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

function renderRail(props = {}) {
    return render(
        <LeftRail
            projects={PROJECTS}
            activeProjectId="all"
            onSelectProject={() => {}}
            conversations={CONVERSATIONS}
            activeConversationId={null}
            onSelectConversation={() => {}}
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

        await user.click(screen.getByRole('button', { name: /Checkout Redesign/ }));

        expect(onSelectProject).toHaveBeenCalledWith('checkout');
    });

    it('forwards conversation selection to onSelectConversation', async () => {
        const user = userEvent.setup();
        const onSelectConversation = vi.fn();
        renderRail({ onSelectConversation });

        await user.click(screen.getByRole('button', { name: /Search intent patterns/ }));

        expect(onSelectConversation).toHaveBeenCalledWith('c3');
    });

    it('collapses and expands, hiding and restoring the projects/conversations content', async () => {
        const user = userEvent.setup();
        renderRail();

        expect(screen.getByRole('navigation', { name: 'Projects' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Collapse rail' }));
        expect(screen.queryByRole('navigation', { name: 'Projects' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Expand rail' }));
        expect(screen.getByRole('navigation', { name: 'Projects' })).toBeInTheDocument();
    });
});
