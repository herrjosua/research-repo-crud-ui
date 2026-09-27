import { render, screen } from '@testing-library/react';
import ChatMessage from './ChatMessage';

describe('ChatMessage', () => {
    it('renders a user message as a plain bubble with its timestamp', () => {
        const message = { id: 'm1', role: 'user', content: 'What are the top pain points?', timestamp: '14:02' };
        render(<ChatMessage message={message} saved={false} onToggleSave={() => {}} />);

        expect(screen.getByText('What are the top pain points?')).toBeInTheDocument();
        expect(screen.getByText('14:02')).toBeInTheDocument();
        expect(screen.queryByText('Ask the Repo')).not.toBeInTheDocument();
    });

    it('renders an assistant message with the avatar/label header and save affordance', () => {
        const message = { id: 'm2', role: 'assistant', content: 'Here is what the corpus shows.', timestamp: '14:02' };
        render(<ChatMessage message={message} saved={false} onToggleSave={() => {}} />);

        expect(screen.getByText('Ask the Repo')).toBeInTheDocument();
        expect(screen.getByText('Here is what the corpus shows.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save as deliverable' })).toBeInTheDocument();
    });
});
