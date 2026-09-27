import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AskTheRepo from './AskTheRepo';

// ChatPanel mounts a Composer (Carbon's TextArea, which measures itself via
// ResizeObserver — no such API in jsdom) and scrolls its message list into
// view on mount (Element.scrollIntoView — also missing in jsdom). Same stubs
// as CreateSessionForm.test.jsx, for the same reason.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    Element.prototype.scrollIntoView = () => {};
});

describe('AskTheRepo', () => {
    it('shows the Ask panel and selects the Ask tab by default', () => {
        render(<AskTheRepo />);

        expect(screen.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true');
        // No conversation is selected by default, so the chat panel starts
        // on its empty/starter state rather than a message list.
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Try asking');
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
        expect(screen.getByText('Try asking')).not.toBeVisible();
    });

    it('switches back to Ask after Saved Insights has been selected', async () => {
        const user = userEvent.setup();
        render(<AskTheRepo />);

        await user.click(screen.getByRole('tab', { name: 'Saved Insights' }));
        await user.click(screen.getByRole('tab', { name: 'Ask' }));

        expect(screen.getByRole('tabpanel')).toHaveTextContent('Try asking');
    });

    it('opens a conversation from the left rail into the chat panel', async () => {
        const user = userEvent.setup();
        render(<AskTheRepo />);

        // "Pain points in checkout flow" (c1) is the one conversation with
        // seeded mock history (see mock/messages.js) — opening it should
        // replace the starter empty-state with that real message list.
        await user.click(screen.getByRole('button', { name: /Pain points in checkout flow/ }));

        expect(screen.queryByText('Try asking')).not.toBeInTheDocument();
        expect(screen.getByText(/top pain points users reported in the checkout flow/)).toBeInTheDocument();
    });

    it('lists the active reply\'s sources in the right rail, and follows each new reply', async () => {
        const user = userEvent.setup();
        render(<AskTheRepo />);
        const rail = screen.getByRole('complementary', { name: 'Sources' });

        // No conversation open yet — nothing to cite.
        expect(within(rail).getByText(/Sources will appear here/)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Pain points in checkout flow/ }));

        // c1's seeded reply cites four sources.
        expect(within(rail).getAllByRole('article')).toHaveLength(4);
        expect(within(rail).getByRole('button', { name: 'Checkout Usability Study — Wave 2' })).toBeInTheDocument();

        await user.type(screen.getByLabelText('Ask a question about the research'), 'And payments?');
        await user.click(screen.getByRole('button', { name: 'Send' }));

        // The mock reply (900ms, see ChatPanel.jsx) becomes the active
        // message; the rail switches to its one cited source.
        expect(
            await within(rail).findByRole('button', { name: 'Research Plan — Checkout Q3' }, { timeout: 3000 })
        ).toBeInTheDocument();
        expect(within(rail).getAllByRole('article')).toHaveLength(1);
    });
});
