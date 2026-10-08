import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourceDetailModal from './SourceDetailModal';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../fixtures/messages';

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

    it('shows the project label and date, and only what exists of them', () => {
        const { rerender } = renderModal({ projectLabel: 'Checkout Redesign' });
        expect(screen.getByText('Checkout Redesign')).toBeInTheDocument();
        expect(screen.getByText(interview.date)).toBeInTheDocument();
        expect(screen.getByText('·')).toBeInTheDocument();

        rerender(
            <SourceDetailModal open source={{ ...interview, date: null }} projectLabel={null} onClose={() => {}} onTogglePin={() => {}} onToggleSave={() => {}} />
        );
        expect(screen.queryByText('·')).not.toBeInTheDocument();
        expect(screen.queryByText(interview.date)).not.toBeInTheDocument();
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

    it('tags a correction source beside the kind tag, with "Corrected <date>" after its date, and no other source', () => {
        const { rerender } = renderModal({ source: { ...transcript, correction: { date: '2026-09-27' } } });
        const tag = screen.getByText('Correction');
        expect(tag.closest('.cds--tag').previousElementSibling).toHaveTextContent('Transcript');
        const date = screen.getByText(transcript.date);
        expect(date.nextElementSibling).toHaveTextContent('·');
        expect(date.nextElementSibling.nextElementSibling).toHaveTextContent('Corrected Sep 27, 2026');

        rerender(
            <SourceDetailModal open source={transcript} onClose={() => {}} onTogglePin={() => {}} onToggleSave={() => {}} />
        );
        expect(screen.queryByText(/Correct/)).not.toBeInTheDocument();
        expect(screen.queryByText('·')).not.toBeInTheDocument();
    });

    it('renders nothing without a source', () => {
        const { container } = renderModal({ source: null });

        expect(container).toBeEmptyDOMElement();
    });
});
