import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssistantMessage from './AssistantMessage';

const MESSAGE = {
    id: 'm2',
    role: 'assistant',
    content: 'Across the corpus, **address form friction** is the top complaint.\n\nA second paragraph.',
    sources: [
        { id: 's1', kind: 'interview', title: 'Checkout Usability Study — Wave 2', excerpt: '…', project: 'Checkout Redesign', date: 'Aug 14, 2026' },
    ],
    timestamp: '14:02',
};

describe('AssistantMessage', () => {
    it('renders each paragraph and bolds **marked** spans', () => {
        render(<AssistantMessage message={MESSAGE} saved={false} onToggleSave={() => {}} />);

        expect(screen.getByText('address form friction').tagName).toBe('STRONG');
        expect(screen.getByText('A second paragraph.')).toBeInTheDocument();
    });

    it('lists cited sources by title', () => {
        render(<AssistantMessage message={MESSAGE} saved={false} onToggleSave={() => {}} />);

        expect(screen.getByText('1 sources cited')).toBeInTheDocument();
        expect(screen.getByText('Checkout Usability Study — Wave 2')).toBeInTheDocument();
    });

    it('renders no sources section when the message has none', () => {
        render(<AssistantMessage message={{ ...MESSAGE, sources: undefined }} saved={false} onToggleSave={() => {}} />);

        expect(screen.queryByText(/sources cited/)).not.toBeInTheDocument();
    });

    it('shows the unsaved save affordance by default and toggles it on click with no arguments', async () => {
        const user = userEvent.setup();
        const onToggleSave = vi.fn();
        render(<AssistantMessage message={MESSAGE} saved={false} onToggleSave={onToggleSave} />);

        expect(screen.getByRole('button', { name: 'Save as deliverable' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Save as deliverable' }));

        expect(onToggleSave).toHaveBeenCalledWith();
    });

    it('shows the saved state when saved is true', () => {
        render(<AssistantMessage message={MESSAGE} saved onToggleSave={() => {}} />);

        expect(screen.getByRole('button', { name: 'Saved as deliverable' })).toBeInTheDocument();
    });
});
