import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourceDetailModal from './SourceDetailModal';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

const [interview, , transcript, synthesis] = INITIAL_MESSAGES_BY_CONVERSATION.c1[1].sources;

function renderModal(props) {
    return render(
        <SourceDetailModal
            open
            source={interview}
            onClose={() => {}}
            onTogglePin={() => {}}
            onToggleSave={() => {}}
            {...props}
        />
    );
}

describe('SourceDetailModal', () => {
    it('shows the excerpt between its before/after context, with the kind tag', () => {
        renderModal();

        expect(screen.getByRole('heading', { name: interview.title })).toBeInTheDocument();
        expect(screen.getByText('Interview')).toBeInTheDocument();
        expect(screen.getByText(interview.contextBefore)).toBeInTheDocument();
        expect(screen.getByText(interview.excerpt)).toBeInTheDocument();
        expect(screen.getByText(interview.contextAfter)).toBeInTheDocument();
        expect(screen.getByText('Cited excerpt')).toBeInTheDocument();
    });

    it('states that pins and saved insights are not stored yet', () => {
        renderModal();

        expect(screen.getByText('Preview only')).toBeInTheDocument();
        expect(screen.getByText(/aren't stored yet/)).toBeInTheDocument();
    });

    it('fires the pin and save toggles', async () => {
        const user = userEvent.setup();
        const onTogglePin = vi.fn();
        const onToggleSave = vi.fn();
        renderModal({ source: transcript, onTogglePin, onToggleSave });

        await user.click(screen.getByRole('button', { name: 'Pin as top finding' }));
        await user.click(screen.getByRole('button', { name: 'Save as insight' }));

        expect(onTogglePin).toHaveBeenCalledTimes(1);
        expect(onToggleSave).toHaveBeenCalledTimes(1);
    });

    it('shows pinned/saved as pressed toggles', () => {
        renderModal({ pinned: true, saved: true });

        expect(screen.getByRole('button', { name: 'Pinned as top finding' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Saved as insight' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('offers only "Save as insight" for kinds that are not primary evidence', () => {
        renderModal({ source: synthesis });

        expect(screen.queryByRole('button', { name: /top finding/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save as insight' })).toBeInTheDocument();
    });

    it('closes via Carbon\'s close button', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderModal({ onClose });

        await user.click(screen.getByRole('button', { name: 'Close' }));

        expect(onClose).toHaveBeenCalled();
    });

    it('renders nothing without a source', () => {
        const { container } = renderModal({ source: null });

        expect(container).toBeEmptyDOMElement();
    });
});
