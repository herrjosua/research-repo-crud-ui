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

    it('lists every project with its count, spelled out for screen readers', async () => {
        const user = userEvent.setup();
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="all" onSelectProject={() => {}} />);

        await user.click(screen.getByRole('combobox', { name: /Project/ }));

        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
            'All Projects, 247 records247',
            'Checkout Redesign, 84 records84',
        ]);
        expect(screen.getByRole('option', { name: /All Projects/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: /Checkout Redesign/ })).toHaveAttribute('aria-selected', 'false');
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

    it('leaves out the count for a project without one', async () => {
        const user = userEvent.setup();
        render(<ProjectSwitcher projects={[{ id: 'all', label: 'All projects' }]} activeProjectId="all" onSelectProject={() => {}} />);

        await user.click(screen.getByRole('combobox', { name: /Project/ }));

        expect(screen.getByRole('option')).toHaveTextContent(/^All projects$/);
    });
});
