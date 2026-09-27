import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourcesPanel from './SourcesPanel';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

const REPLY = INITIAL_MESSAGES_BY_CONVERSATION.c1[1];
const [interview] = REPLY.sources;

describe('SourcesPanel', () => {
    it('lists every source the message cites, with a count', () => {
        render(<SourcesPanel message={REPLY} />);

        const panel = screen.getByRole('complementary', { name: 'Sources' });
        expect(within(panel).getAllByRole('article')).toHaveLength(REPLY.sources.length);
        expect(within(panel).getByText(String(REPLY.sources.length))).toBeInTheDocument();
        expect(within(panel).getByText(`Cited in reply · ${REPLY.timestamp}`)).toBeInTheDocument();
    });

    it('shows the empty state when there is no active reply', () => {
        render(<SourcesPanel message={null} />);

        expect(screen.getByText(/Sources will appear here/)).toBeInTheDocument();
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });

    it('opens the clicked source in the detail modal', async () => {
        const user = userEvent.setup();
        render(<SourcesPanel message={REPLY} />);

        await user.click(screen.getByRole('button', { name: interview.title }));

        // Carbon marks the open state on the outer `.cds--modal` wrapper.
        expect(screen.getByRole('dialog').closest('.cds--modal')).toHaveClass('is-visible');
        expect(screen.getByText(interview.contextBefore)).toBeInTheDocument();
    });

    it('shares pin state between a card and its modal', async () => {
        const user = userEvent.setup();
        render(<SourcesPanel message={REPLY} />);
        const card = screen.getAllByRole('article')[0];

        await user.click(within(card).getByRole('button', { name: 'Pin as top finding' }));
        await user.click(within(card).getByRole('button', { name: interview.title }));

        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pinned as top finding' })).toBeInTheDocument();
    });

    it('states that pins are a preview', () => {
        render(<SourcesPanel message={REPLY} />);

        expect(screen.getByText(/nothing is stored yet/)).toBeInTheDocument();
    });
});
