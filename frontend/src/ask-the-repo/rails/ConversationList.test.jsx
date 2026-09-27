import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConversationList from './ConversationList';

const CONVERSATIONS = [
    { id: 'c1', title: 'Pain points in checkout flow', project: 'checkout', lastMessage: 'Users consistently cited…', time: '2m', unread: true },
    { id: 'c2', title: 'Onboarding drop-off reasons', project: 'onboarding', lastMessage: 'Three dominant themes…', time: '1h' },
];

describe('ConversationList', () => {
    it('renders every conversation with its preview and time', () => {
        render(<ConversationList conversations={CONVERSATIONS} activeConversationId={null} onSelectConversation={() => {}} />);

        expect(screen.getByRole('button', { name: /Pain points in checkout flow/ })).toHaveTextContent('2m');
        expect(screen.getByText('Three dominant themes…')).toBeInTheDocument();
    });

    it('marks the active conversation current and no other', () => {
        render(<ConversationList conversations={CONVERSATIONS} activeConversationId="c2" onSelectConversation={() => {}} />);

        expect(screen.getByRole('button', { name: /Onboarding drop-off reasons/ })).toHaveAttribute('aria-current', 'true');
        expect(screen.getByRole('button', { name: /Pain points in checkout flow/ })).not.toHaveAttribute('aria-current');
    });

    it('calls onSelectConversation with the clicked conversation id', async () => {
        const user = userEvent.setup();
        const onSelectConversation = vi.fn();
        render(<ConversationList conversations={CONVERSATIONS} activeConversationId={null} onSelectConversation={onSelectConversation} />);

        await user.click(screen.getByRole('button', { name: /Onboarding drop-off reasons/ }));

        expect(onSelectConversation).toHaveBeenCalledWith('c2');
    });

    it('shows an empty state when there are no conversations', () => {
        render(<ConversationList conversations={[]} activeConversationId={null} onSelectConversation={() => {}} />);

        expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
