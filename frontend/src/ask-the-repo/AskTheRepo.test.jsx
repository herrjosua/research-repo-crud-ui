import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AskTheRepo from './AskTheRepo';

describe('AskTheRepo', () => {
    it('shows the Ask panel and selects the Ask tab by default', () => {
        render(<AskTheRepo />);

        expect(screen.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Chat content ships in a later ticket.');
    });

    it('switches to the Saved Insights panel when that tab is clicked', async () => {
        const user = userEvent.setup();
        render(<AskTheRepo />);

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));

        expect(screen.getByRole('tab', { name: 'Saved Insights' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Saved insights content ships in a later ticket.');
        // Carbon's TabPanels keeps unselected panels mounted with a `hidden`
        // attribute rather than removing them, so this checks visibility, not
        // presence in the DOM.
        expect(screen.getByText('Chat content ships in a later ticket.')).not.toBeVisible();
    });

    it('switches back to Ask after Saved Insights has been selected', async () => {
        const user = userEvent.setup();
        render(<AskTheRepo />);

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));
        await user.click(screen.getByRole('tab', { name: 'Ask' }));

        expect(screen.getByRole('tabpanel')).toHaveTextContent('Chat content ships in a later ticket.');
    });
});
