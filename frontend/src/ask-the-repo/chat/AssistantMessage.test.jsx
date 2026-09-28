import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssistantMessage from './AssistantMessage';

const INTERVIEW = { id: 'raw:a#1', kind: 'interview', title: 'Checkout Usability Study — Wave 2', excerpt: '…', project: null, recordProject: 'project-checkout', date: 'Aug 14, 2026' };
const SURVEY = { id: 'raw:b#0', kind: 'survey', title: 'Post-Purchase Survey Q3', excerpt: '…', project: null, recordProject: null, date: null };

const MESSAGE = {
    id: 'm2',
    role: 'assistant',
    content: 'Address form friction is the top complaint [1][2].\nIt came up in every wave.\n\nA second paragraph.',
    sources: [INTERVIEW, SURVEY],
    timestamp: '14:02',
};

function renderMessage(props = {}) {
    return render(<AssistantMessage message={MESSAGE} saved={false} onToggleSave={() => {}} {...props} />);
}

describe('AssistantMessage', () => {
    it('renders each paragraph as plain text, keeping single line breaks', () => {
        const { container } = renderMessage();

        const paragraphs = container.querySelectorAll('p');
        expect(paragraphs[0]).toHaveTextContent('Address form friction is the top complaint 12.It came up in every wave.');
        expect(paragraphs[0].querySelectorAll('br')).toHaveLength(1);
        expect(screen.getByText('A second paragraph.')).toBeInTheDocument();
    });

    it('leaves markdown-looking text alone (answers are plain text)', () => {
        renderMessage({ message: { ...MESSAGE, content: 'A **bold** claim.' } });

        expect(screen.getByText('A **bold** claim.')).toBeInTheDocument();
        expect(document.querySelector('strong')).toBeNull();
    });

    it('renders "- " lines as a list', () => {
        const { container } = renderMessage({ message: { ...MESSAGE, content: 'Three themes:\n- Address form [1]\n- Payments\n- Registration\nThat is all.' } });

        // Carbon's UnorderedList (the other list here is the cited sources).
        const list = container.querySelector('.cds--list--unordered');
        const items = within(list).getAllByRole('listitem');
        expect(items.map((item) => item.textContent)).toEqual(['Address form 1', 'Payments', 'Registration']);
        expect(screen.getByText('Three themes:')).toBeInTheDocument();
        expect(screen.getByText('That is all.')).toBeInTheDocument();
    });

    it('turns each [n] into a button that opens sources[n - 1]', async () => {
        const user = userEvent.setup();
        const onOpenSource = vi.fn();
        renderMessage({ onOpenSource });

        await user.click(screen.getByRole('button', { name: `Source 2: ${SURVEY.title}` }));

        expect(onOpenSource).toHaveBeenCalledWith(SURVEY, expect.objectContaining({ type: 'click' }));
        expect(screen.getByRole('button', { name: `Source 1: ${INTERVIEW.title}` })).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('renders an out-of-range [n] as plain text', () => {
        renderMessage({ message: { ...MESSAGE, content: 'Only one source [1], not [3].' } });

        expect(screen.getAllByRole('button', { name: /^Source / })).toHaveLength(1);
        expect(screen.getByText(/not \[3\]\./)).toBeInTheDocument();
    });

    it('lists cited sources by title', () => {
        renderMessage();

        expect(screen.getByText('2 sources cited')).toBeInTheDocument();
        expect(screen.getByText('Checkout Usability Study — Wave 2')).toBeInTheDocument();
    });

    it('says so when the answer cites no records', () => {
        renderMessage({ message: { ...MESSAGE, content: "The sources don't cover that.", sources: [] } });

        expect(screen.queryByText(/sources cited/)).not.toBeInTheDocument();
        expect(screen.getByText('No records were cited for this answer.')).toBeInTheDocument();
    });

    it('shows the unsaved save affordance by default and toggles it on click with no arguments', async () => {
        const user = userEvent.setup();
        const onToggleSave = vi.fn();
        renderMessage({ onToggleSave });

        await user.click(screen.getByRole('button', { name: 'Save as deliverable' }));

        expect(onToggleSave).toHaveBeenCalledWith();
    });

    it('shows the saved state when saved is true', () => {
        renderMessage({ saved: true });

        expect(screen.getByRole('button', { name: 'Saved as deliverable' })).toBeInTheDocument();
    });

    it('says deliverables are a preview', () => {
        renderMessage();

        expect(screen.getByText('Deliverables are a preview — nothing is stored yet.')).toBeInTheDocument();
    });
});
