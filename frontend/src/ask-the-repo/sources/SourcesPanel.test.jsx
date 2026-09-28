import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourcesPanel from './SourcesPanel';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../fixtures/messages';
import { projectLabelFor } from '../fixtures/constants';
import cardStyles from './SourceCard.module.scss';

const REPLY = INITIAL_MESSAGES_BY_CONVERSATION.c1[1];
const [interview, survey] = REPLY.sources;

function renderPanel(props = {}) {
    return render(
        <SourcesPanel
            message={REPLY}
            onOpenSource={() => {}}
            onTogglePin={() => {}}
            projectLabelFor={projectLabelFor}
            {...props}
        />
    );
}

describe('SourcesPanel', () => {
    it('lists every source the message cites, with a count', () => {
        renderPanel();

        const panel = screen.getByRole('complementary', { name: 'Sources' });
        expect(within(panel).getAllByRole('article')).toHaveLength(REPLY.sources.length);
        expect(within(panel).getByText(String(REPLY.sources.length))).toBeInTheDocument();
        expect(within(panel).getByText(`Cited in reply · ${REPLY.timestamp}`)).toBeInTheDocument();
    });

    it('shows each source\'s project by its label, from recordProject', () => {
        renderPanel();

        expect(screen.getAllByText(`Checkout Redesign · ${interview.date}`)).toHaveLength(1);
    });

    it('shows the empty state when there is no active reply', () => {
        renderPanel({ message: null });

        expect(screen.getByText(/Sources will appear here/)).toBeInTheDocument();
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });

    it('says so when the active reply cited nothing', () => {
        renderPanel({ message: { ...REPLY, sources: [] } });

        expect(screen.getByText("This reply didn't cite any sources.")).toBeInTheDocument();
        expect(screen.queryByText(/nothing is stored yet/)).not.toBeInTheDocument();
    });

    it('reports the clicked source through onOpenSource', async () => {
        const user = userEvent.setup();
        const onOpenSource = vi.fn();
        renderPanel({ onOpenSource });

        await user.click(screen.getByRole('button', { name: interview.title }));

        expect(onOpenSource).toHaveBeenCalledWith(interview, expect.objectContaining({ type: 'click' }));
    });

    it('highlights the selected source and shows pinned ones as pinned', () => {
        renderPanel({ selectedSourceId: survey.id, pinnedIds: new Set([interview.id]) });
        const [interviewCard, surveyCard] = screen.getAllByRole('article');

        expect(surveyCard).toHaveClass(cardStyles.selected);
        expect(interviewCard).not.toHaveClass(cardStyles.selected);
        expect(within(interviewCard).getByRole('button', { name: 'Pinned as top finding' })).toBeInTheDocument();
    });

    it('reports a pin toggle with its source', async () => {
        const user = userEvent.setup();
        const onTogglePin = vi.fn();
        renderPanel({ onTogglePin });

        await user.click(within(screen.getAllByRole('article')[0]).getByRole('button', { name: 'Pin as top finding' }));

        expect(onTogglePin).toHaveBeenCalledWith(interview);
    });

    it('states that pins are a preview', () => {
        renderPanel();

        expect(screen.getByText(/nothing is stored yet/)).toBeInTheDocument();
    });
});
