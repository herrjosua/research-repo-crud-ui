import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InsightCard, { PREVIEW_LENGTH } from './InsightCard';
import { SAMPLE_INSIGHTS } from '../fixtures/insights';

const SHORT = SAMPLE_INSIGHTS[0];
const LONG = SAMPLE_INSIGHTS.find((insight) => insight.content.length > PREVIEW_LENGTH);

describe('InsightCard', () => {
    it('shows the source kind, save date, title, and full short content', () => {
        render(<InsightCard insight={SHORT} onRemove={() => {}} />);

        expect(screen.getByText('Interview')).toBeInTheDocument();
        expect(screen.getByText(`Saved ${SHORT.date}`)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: SHORT.title })).toBeInTheDocument();
        expect(screen.getByText(SHORT.content)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    });

    it('collapses long content to a preview and expands/collapses it', async () => {
        const user = userEvent.setup();
        render(<InsightCard insight={LONG} onRemove={() => {}} />);

        const toggle = screen.getByRole('button', { name: 'Show more' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText(LONG.content)).not.toBeInTheDocument();
        expect(screen.getByText(`${LONG.content.slice(0, PREVIEW_LENGTH).trimEnd()}…`)).toBeInTheDocument();

        await user.click(toggle);
        expect(screen.getByText(LONG.content)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');

        await user.click(screen.getByRole('button', { name: 'Show less' }));
        expect(screen.queryByText(LONG.content)).not.toBeInTheDocument();
    });

    it('ties the toggle to the text it controls', () => {
        render(<InsightCard insight={LONG} onRemove={() => {}} />);

        const controlled = screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-controls');
        expect(document.getElementById(controlled)).toHaveTextContent(LONG.content.slice(0, 40));
    });

    it('removes via its remove button', async () => {
        const user = userEvent.setup();
        const onRemove = vi.fn();
        render(<InsightCard insight={SHORT} onRemove={onRemove} />);

        await user.click(screen.getByRole('button', { name: 'Remove insight' }));

        expect(onRemove).toHaveBeenCalledTimes(1);
    });
});
