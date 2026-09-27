import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from './ChatPanel';
import { useConversationMessages } from './useConversationMessages';

// ChatPanel's messages live in `useConversationMessages` (lifted to
// AskTheRepo.jsx in Story 5), so mount it with that same store here.
function ChatPanelWithStore({ projectId, conversationId }) {
    const { getMessages, appendMessage } = useConversationMessages();
    return (
        <ChatPanel
            projectId={projectId}
            conversationId={conversationId}
            messages={getMessages(conversationId)}
            onAppendMessage={appendMessage}
        />
    );
}

// Composer's Carbon TextArea measures itself via ResizeObserver, and the
// message list scrolls itself into view on mount/update via
// Element.scrollIntoView — neither exists in jsdom. Same stubs as
// CreateSessionForm.test.jsx.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

describe('ChatPanel', () => {
    it('shows starter questions for the active project when no conversation is selected', () => {
        render(<ChatPanelWithStore projectId="checkout" conversationId={null} />);

        expect(screen.getByText('Try asking')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'What are the top pain points in the checkout flow?' })).toBeInTheDocument();
    });

    it('falls back to the "all" starters for a project id with no entry of its own', () => {
        render(<ChatPanelWithStore projectId="not-a-real-project" conversationId={null} />);

        expect(screen.getByRole('button', { name: 'What are the most common pain points across all projects?' })).toBeInTheDocument();
    });

    it('shows c1\'s seeded message history when that conversation is active', () => {
        render(<ChatPanelWithStore projectId="checkout" conversationId="c1" />);

        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        expect(screen.getByText(/top pain points users reported in the checkout flow/)).toBeInTheDocument();
        expect(screen.getByText(/Across 22 interviews and 340 survey responses/)).toBeInTheDocument();
    });

    it('fills the composer instead of sending when a starter question is clicked', async () => {
        const user = userEvent.setup();
        render(<ChatPanelWithStore projectId="checkout" conversationId={null} />);

        await user.click(screen.getByRole('button', { name: 'Why do users abandon before payment?' }));

        expect(screen.getByLabelText('Ask a question about the research')).toHaveValue('Why do users abandon before payment?');
        // Still the starter empty state — filling the composer isn't the
        // same as sending.
        expect(screen.getByText('Try asking')).toBeInTheDocument();
    });

    it('sends a message and shows a mock assistant reply', async () => {
        const user = userEvent.setup();
        render(<ChatPanelWithStore projectId="checkout" conversationId={null} />);

        const field = screen.getByLabelText('Ask a question about the research');
        await user.type(field, 'What does the data say?');
        await user.click(screen.getByRole('button', { name: 'Send' }));

        expect(screen.getByText('What does the data say?')).toBeInTheDocument();
        expect(field).toHaveValue('');
        // The mock reply lands after a fixed 900ms delay (see
        // ChatPanel.jsx's mockReplyTo) — give findBy more room than its
        // 1000ms default so this isn't flaky under load.
        expect(await screen.findByRole('button', { name: 'Save as deliverable' }, { timeout: 3000 })).toBeInTheDocument();
    });

    it('toggles the save affordance for a specific message independently of others', async () => {
        const user = userEvent.setup();
        render(<ChatPanelWithStore projectId="checkout" conversationId="c1" />);

        await user.click(screen.getByRole('button', { name: 'Save as deliverable' }));

        expect(screen.getByRole('button', { name: 'Saved as deliverable' })).toBeInTheDocument();
    });
});
