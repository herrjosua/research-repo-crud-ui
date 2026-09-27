import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SavedInsightsView from './SavedInsightsView';
import { SAMPLE_INSIGHTS } from '../mock/insights';
import { PROJECTS } from '../mock/constants';

describe('SavedInsightsView', () => {
    it('groups insights by project, with unmatched ones under Other', () => {
        render(<SavedInsightsView insights={SAMPLE_INSIGHTS} projects={PROJECTS} onRemove={() => {}} />);

        const checkout = screen.getByRole('region', { name: 'Checkout Redesign' });
        expect(within(checkout).getAllByRole('listitem')).toHaveLength(2);
        expect(within(checkout).getByText('2 insights')).toBeInTheDocument();
        expect(within(screen.getByRole('region', { name: 'Onboarding v3' })).getByText('1 insight')).toBeInTheDocument();
        expect(
            within(screen.getByRole('region', { name: 'Other' })).getByRole('heading', { name: 'Competitive Teardown — Payments' })
        ).toBeInTheDocument();
        // Projects with no insights get no section.
        expect(screen.queryByRole('region', { name: 'Mobile Navigation' })).not.toBeInTheDocument();
    });

    it('omits the Other section when every insight matches a project', () => {
        const matched = SAMPLE_INSIGHTS.filter((insight) => insight.project === 'checkout');
        render(<SavedInsightsView insights={matched} projects={PROJECTS} onRemove={() => {}} />);

        expect(screen.queryByRole('region', { name: 'Other' })).not.toBeInTheDocument();
    });

    it('passes the removed insight\'s id up', async () => {
        const user = userEvent.setup();
        const onRemove = vi.fn();
        render(<SavedInsightsView insights={SAMPLE_INSIGHTS.slice(0, 1)} projects={PROJECTS} onRemove={onRemove} />);

        await user.click(screen.getByRole('button', { name: 'Remove insight' }));

        expect(onRemove).toHaveBeenCalledWith(SAMPLE_INSIGHTS[0].id);
    });

    it('states that insights are not saved to the repo, including when empty', () => {
        render(<SavedInsightsView insights={[]} projects={PROJECTS} onRemove={() => {}} />);

        expect(screen.getByText('Session only')).toBeInTheDocument();
        expect(screen.getByText(/aren't saved to the repo yet/)).toBeInTheDocument();
        expect(screen.getByText('No saved insights yet')).toBeInTheDocument();
    });
});
