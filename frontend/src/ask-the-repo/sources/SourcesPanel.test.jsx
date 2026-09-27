import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourcesPanel from './SourcesPanel';
import { useSavedInsights } from '../insights/useSavedInsights';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

// Saved-as-insight state lives in `useSavedInsights` (lifted to
// AskTheRepo.jsx in Story 6), so mount the panel with that same store.
function SourcesPanelWithStore({ message }) {
    const { savedSourceIds, toggleSourceInsight } = useSavedInsights();
    return <SourcesPanel message={message} savedSourceIds={savedSourceIds} onToggleSaveSource={toggleSourceInsight} />;
}

const REPLY = INITIAL_MESSAGES_BY_CONVERSATION.c1[1];
const [interview] = REPLY.sources;

describe('SourcesPanel', () => {
    it('lists every source the message cites, with a count', () => {
        render(<SourcesPanelWithStore message={REPLY} />);

        const panel = screen.getByRole('complementary', { name: 'Sources' });
        expect(within(panel).getAllByRole('article')).toHaveLength(REPLY.sources.length);
        expect(within(panel).getByText(String(REPLY.sources.length))).toBeInTheDocument();
        expect(within(panel).getByText(`Cited in reply · ${REPLY.timestamp}`)).toBeInTheDocument();
    });

    it('shows the empty state when there is no active reply', () => {
        render(<SourcesPanelWithStore message={null} />);

        expect(screen.getByText(/Sources will appear here/)).toBeInTheDocument();
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });

    it('opens the clicked source in the detail modal', async () => {
        const user = userEvent.setup();
        render(<SourcesPanelWithStore message={REPLY} />);

        await user.click(screen.getByRole('button', { name: interview.title }));

        // Carbon marks the open state on the outer `.cds--modal` wrapper.
        expect(screen.getByRole('dialog').closest('.cds--modal')).toHaveClass('is-visible');
        expect(screen.getByText(interview.contextBefore)).toBeInTheDocument();
    });

    it('shares pin state between a card and its modal', async () => {
        const user = userEvent.setup();
        render(<SourcesPanelWithStore message={REPLY} />);
        const card = screen.getAllByRole('article')[0];

        await user.click(within(card).getByRole('button', { name: 'Pin as top finding' }));
        await user.click(within(card).getByRole('button', { name: interview.title }));

        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pinned as top finding' })).toBeInTheDocument();
    });

    it('states that pins are a preview', () => {
        render(<SourcesPanelWithStore message={REPLY} />);

        expect(screen.getByText(/nothing is stored yet/)).toBeInTheDocument();
    });

    it('toggles "Save as insight" through the shared insights store', async () => {
        const user = userEvent.setup();
        const onToggleSaveSource = vi.fn();
        render(<SourcesPanel message={REPLY} savedSourceIds={new Set([interview.id])} onToggleSaveSource={onToggleSaveSource} />);

        await user.click(screen.getByRole('button', { name: interview.title }));
        const dialog = screen.getByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Saved as insight' }));

        expect(onToggleSaveSource).toHaveBeenCalledWith(interview);
    });
});
