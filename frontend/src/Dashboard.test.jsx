import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';
import { useRecords } from './api/records';

vi.mock('./api/records', () => ({
    useRecords: vi.fn(),
}));

vi.mock('./CreateSessionForm', () => ({
    default: () => <div>Mock CreateSessionForm</div>,
}));

vi.mock('./RecordDetail', () => ({
    default: ({ id }) => <div>Mock RecordDetail for {id}</div>,
}));

const sampleRecords = [
    { id: 'raw:1', kind: 'raw', title: 'Raw One', date: '2026-01-01', type: 'usability-test', tags: ['onboarding'] },
    { id: 'finding:1', kind: 'finding', title: 'Finding One', date: '2026-01-02', type: 'synthesis', tags: ['onboarding', 'usability'] },
    { id: 'component:1', kind: 'component', title: 'Component One', date: '2026-01-03', type: 'component', tags: [] },
];

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Dashboard', () => {
    it('shows all records when no filters are applied', () => {
        useRecords.mockReturnValue({ isLoading: false, isError: false, data: sampleRecords });
        render(<Dashboard />);

        expect(screen.getByText('3 of 3 records')).toBeInTheDocument();
        expect(screen.getByText('Raw One')).toBeInTheDocument();
        expect(screen.getByText('Finding One')).toBeInTheDocument();
        expect(screen.getByText('Component One')).toBeInTheDocument();
    });

    it('filters out a kind when its checkbox is unchecked', async () => {
        useRecords.mockReturnValue({ isLoading: false, isError: false, data: sampleRecords });
        const user = userEvent.setup();
        render(<Dashboard />);

        await user.click(screen.getByLabelText('raw'));

        expect(screen.getByText('2 of 3 records')).toBeInTheDocument();
        expect(screen.queryByText('Raw One')).not.toBeInTheDocument();
        expect(screen.getByText('Finding One')).toBeInTheDocument();
    });

    it('filters to only records with a checked tag', async () => {
        useRecords.mockReturnValue({ isLoading: false, isError: false, data: sampleRecords });
        const user = userEvent.setup();
        render(<Dashboard />);

        await user.click(screen.getByLabelText('usability'));

        // Only Finding One carries the "usability" tag.
        expect(screen.getByText('1 of 3 records')).toBeInTheDocument();
        expect(screen.getByText('Finding One')).toBeInTheDocument();
        expect(screen.queryByText('Raw One')).not.toBeInTheDocument();
        expect(screen.queryByText('Component One')).not.toBeInTheDocument();
    });

    it('shows the empty state when a filter combination matches nothing', async () => {
        useRecords.mockReturnValue({ isLoading: false, isError: false, data: sampleRecords });
        const user = userEvent.setup();
        render(<Dashboard />);

        // "usability" only appears on Finding One — excluding the "finding"
        // kind on top of that guarantees zero matches deterministically.
        await user.click(screen.getByLabelText('usability'));
        await user.click(screen.getByLabelText('finding'));

        expect(screen.getByText('0 of 3 records')).toBeInTheDocument();
        expect(screen.getByText('No matching records')).toBeInTheDocument();
    });

    it('shows a loading state', () => {
        useRecords.mockReturnValue({ isLoading: true, isError: false, data: undefined });
        render(<Dashboard />);

        expect(screen.getByText('Loading records…')).toBeInTheDocument();
    });

    it('shows an error state with the server message', () => {
        useRecords.mockReturnValue({
            isLoading: false,
            isError: true,
            error: { message: 'Failed to fetch records' },
        });
        render(<Dashboard />);

        expect(screen.getByText('Failed to load records')).toBeInTheDocument();
        expect(screen.getByText('Failed to fetch records')).toBeInTheDocument();
    });
});