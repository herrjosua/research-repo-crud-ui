import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from './ChatPanel';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../fixtures/messages';

const THREAD = INITIAL_MESSAGES_BY_CONVERSATION.c1;
const STARTERS = ['What did coders think of the AI billing code suggestions?', 'How much documentation burden do clinicians report?'];
const QUESTION = 'What did the prior auth usability tests find?';

function renderPanel(props = {}) {
    return render(
        <ChatPanel
            messages={[]}
            starters={STARTERS}
            onSend={() => {}}
            onRetry={() => {}}
            onSignIn={() => {}}
            onOpenSource={() => {}}
            {...props}
        />
    );
}

const composer = () => screen.getByLabelText('Ask a question about the research');

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
    it('shows the starter questions when the conversation is empty', () => {
        renderPanel();

        expect(screen.getByText('Try asking')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: STARTERS[0] })).toBeEnabled();
    });

    it('shows no starter list when there are none for the project', () => {
        renderPanel({ starters: [] });

        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        expect(composer()).toBeEnabled();
    });

    it('fills the composer instead of sending when a starter question is clicked', async () => {
        const user = userEvent.setup();
        const onSend = vi.fn();
        renderPanel({ onSend });

        await user.click(screen.getByRole('button', { name: STARTERS[1] }));

        expect(composer()).toHaveValue(STARTERS[1]);
        expect(onSend).not.toHaveBeenCalled();
    });

    it('sends the trimmed question and clears the composer', async () => {
        const user = userEvent.setup();
        const onSend = vi.fn();
        renderPanel({ onSend });

        await user.type(composer(), `  ${QUESTION}  `);
        await user.click(screen.getByRole('button', { name: 'Send' }));

        expect(onSend).toHaveBeenCalledWith(QUESTION);
        expect(composer()).toHaveValue('');
    });

    it('renders the conversation\'s messages', () => {
        renderPanel({ messages: THREAD });

        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        expect(screen.getByText(THREAD[0].content)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Source 1: / })).toBeInTheDocument();
    });

    it('passes inline citation clicks up', async () => {
        const user = userEvent.setup();
        const onOpenSource = vi.fn();
        renderPanel({ messages: THREAD, onOpenSource });

        await user.click(screen.getByRole('button', { name: /^Source 4: / }));

        expect(onOpenSource).toHaveBeenCalledWith(THREAD[1].sources[3], expect.anything());
    });

    it('toggles "Save as deliverable" for one message', async () => {
        const user = userEvent.setup();
        renderPanel({ messages: THREAD });

        await user.click(screen.getByRole('button', { name: 'Save as deliverable' }));

        expect(screen.getByRole('button', { name: 'Saved as deliverable' })).toBeInTheDocument();
    });

    describe('while loading', () => {
        it('shows the loading state after the question and disables the composer', () => {
            renderPanel({ status: 'loading', messages: [THREAD[0]] });

            expect(screen.getByText('Searching the repo…')).toBeInTheDocument();
            expect(screen.queryByText(/can take up to 20 seconds/)).not.toBeInTheDocument();
            expect(composer()).toBeDisabled();
            expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        });

        it('explains the wait once the answer is slow', () => {
            renderPanel({ status: 'loading', slow: true });

            expect(screen.getByText(/The first question after a server restart can take up to 20 seconds/)).toBeInTheDocument();
        });
    });

    describe('when unavailable', () => {
        it('says so, disables the composer, and shows no starters', () => {
            renderPanel({ unavailable: true });

            expect(screen.getByText("Ask the Repo isn't available here.")).toBeInTheDocument();
            expect(screen.getByText(/You can still browse everything under Research Records/)).toBeInTheDocument();
            expect(composer()).toBeDisabled();
            expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: STARTERS[0] })).not.toBeInTheDocument();
        });

        it('shows the notice after the thread when it follows a question', () => {
            renderPanel({ unavailable: true, messages: [THREAD[0]] });

            const question = screen.getByText(THREAD[0].content);
            const notice = screen.getByText("Ask the Repo isn't available here.");
            expect(question.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        });
    });

    describe('after an error', () => {
        const userMessage = { id: 'm1', role: 'user', content: QUESTION, timestamp: '10:00' };

        it('keeps the question in the thread and puts it back in the composer (model down)', () => {
            renderPanel({ messages: [userMessage], status: 'error', error: { kind: 'model', question: QUESTION } });

            expect(screen.getByText("Couldn't get an answer.")).toBeInTheDocument();
            expect(screen.getByText("The language model didn't respond. Try again in a moment.")).toBeInTheDocument();
            expect(screen.getByText(QUESTION, { selector: 'div' })).toBeInTheDocument();
            expect(composer()).toHaveValue(QUESTION);
        });

        it('retries, clearing the restored question', async () => {
            const user = userEvent.setup();
            const onRetry = vi.fn();
            renderPanel({ messages: [userMessage], status: 'error', error: { kind: 'model', question: QUESTION }, onRetry });

            await user.click(screen.getByRole('button', { name: 'Try again' }));

            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(composer()).toHaveValue('');
        });

        it('offers to sign in again when the session has ended', async () => {
            const user = userEvent.setup();
            const onSignIn = vi.fn();
            renderPanel({ messages: [userMessage], status: 'error', error: { kind: 'session', question: QUESTION }, onSignIn });

            expect(screen.getByText('Your session has ended.')).toBeInTheDocument();
            expect(screen.getByText('Sign in again to keep asking.')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
            expect(composer()).toHaveValue('');

            await user.click(screen.getByRole('button', { name: 'Sign in again' }));
            expect(onSignIn).toHaveBeenCalledTimes(1);
        });

        it('shows a generic message for anything else', () => {
            renderPanel({ messages: [userMessage], status: 'error', error: { kind: 'unknown', question: QUESTION } });

            expect(screen.getByText('Something went wrong getting an answer.')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
        });
    });

    it('puts the announcement in a polite live region', () => {
        renderPanel({ announcement: 'Answer received, 2 sources cited.' });

        expect(screen.getByText('Answer received, 2 sources cited.')).toHaveAttribute('aria-live', 'polite');
    });

    it('makes the thread a focusable, named region so it can be scrolled from the keyboard', () => {
        renderPanel({ unavailable: true });

        expect(screen.getByRole('region', { name: 'Conversation' })).toHaveAttribute('tabindex', '0');
    });
});
