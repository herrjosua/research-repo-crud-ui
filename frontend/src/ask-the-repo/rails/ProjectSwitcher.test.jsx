import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectSwitcher from './ProjectSwitcher';

const PROJECTS = [
    { id: 'all', label: 'All Projects', count: 247 },
    { id: 'checkout', label: 'Checkout Redesign', count: 84 },
];

describe('ProjectSwitcher', () => {
    it('renders every project with its count', () => {
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="all" onSelectProject={() => {}} />);

        expect(screen.getByRole('button', { name: /All Projects/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Checkout Redesign/ })).toHaveTextContent('84');
    });

    it('marks the active project current and no other', () => {
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="checkout" onSelectProject={() => {}} />);

        expect(screen.getByRole('button', { name: /Checkout Redesign/ })).toHaveAttribute('aria-current', 'true');
        expect(screen.getByRole('button', { name: /All Projects/ })).not.toHaveAttribute('aria-current');
    });

    it('calls onSelectProject with the clicked project id', async () => {
        const user = userEvent.setup();
        const onSelectProject = vi.fn();
        render(<ProjectSwitcher projects={PROJECTS} activeProjectId="all" onSelectProject={onSelectProject} />);

        await user.click(screen.getByRole('button', { name: /Checkout Redesign/ }));

        expect(onSelectProject).toHaveBeenCalledWith('checkout');
    });
});
