import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectSwitcher from './ProjectSwitcher';

const PROJECTS = [
    { id: 'all', label: 'All Projects', count: 247 },
    { id: 'checkout', label: 'Checkout Redesign', count: 84 },
];

// Carbon's Dropdown scrolls the highlighted option into view
// (Element.scrollIntoView — missing in jsdom). Same stub as
// CreateSessionForm.test.jsx.
beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
});

describe('ProjectSwitcher', () => {
    it('is a dropdown labelled "Project" that shows the selected project closed', () => {
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="checkout" onSelectProject={() => {}} />);

        expect(screen.getByRole('combobox', { name: /Project/ })).toHaveTextContent('Checkout Redesign');
    });

    it('lists every project by label alone, without its count', async () => {
        const user = userEvent.setup();
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="all" onSelectProject={() => {}} />);

        await user.click(screen.getByRole('combobox', { name: /Project/ }));

        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'All Projects',
            'Checkout Redesign',
        ]);
        expect(screen.getByRole('option', { name: 'All Projects' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: 'Checkout Redesign' })).toHaveAttribute('aria-selected', 'false');
    });

    it('says under the field how many records the selected project searches, as the field\'s description', () => {
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="checkout" onSelectProject={() => {}} />);

        expect(screen.getByText('Searches 84 records')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Project/ })).toHaveAccessibleDescription('Searches 84 records');
    });

    it('says "all" for the no-filter entry, and "record" for a count of one', () => {
        const { rerender } = render(<ProjectSwitcher projects={PROJECTS} activeProjectId="all" onSelectProject={() => {}} />);
        expect(screen.getByRole('combobox', { name: /Project/ })).toHaveAccessibleDescription('Searches all 247 records');

        rerender(<ProjectSwitcher projects={[{ id: 'solo', label: 'Solo', count: 1 }]} activeProjectId="solo" onSelectProject={() => {}} />);
        expect(screen.getByRole('combobox', { name: /Project/ })).toHaveAccessibleDescription('Searches 1 record');
    });

    it('calls onSelectProject with the chosen project id', async () => {
        const user = userEvent.setup();
        const onSelectProject = vi.fn();
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="all" onSelectProject={onSelectProject} />);

        await user.click(screen.getByRole('combobox', { name: /Project/ }));
        await user.click(screen.getByRole('option', { name: /Checkout Redesign/ }));

        expect(onSelectProject).toHaveBeenCalledWith('checkout');
    });

    it('can be opened and chosen from with the keyboard', async () => {
        const user = userEvent.setup();
        const onSelectProject = vi.fn();
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="all" onSelectProject={onSelectProject} />);

        await user.tab();
        expect(screen.getByRole('combobox', { name: /Project/ })).toHaveFocus();
        await user.keyboard('{Enter}{ArrowDown}{Enter}');

        expect(onSelectProject).toHaveBeenCalledWith('checkout');
    });

    it('shows no helper text when the selected project has no count', () => {
        render(<ProjectSwitcher projects={[{ id: 'all', label: 'All projects' }]} activeProjectId="all" onSelectProject={() => {}} />);

        expect(screen.queryByText(/Searches/)).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Project/ })).not.toHaveAttribute('aria-describedby');
    });
});
