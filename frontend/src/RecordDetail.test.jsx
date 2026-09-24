import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecordDetail from './RecordDetail';
import { useRecord, useDeleteRecord, useRecordHistory } from './api/records';

vi.mock('./api/records', () => ({
    useRecord: vi.fn(),
    useDeleteRecord: vi.fn(),
    useRecordHistory: vi.fn(),
}));

// Stands in for the real form: each button simulates a successful PUT,
// with or without a build_index.py warning.
vi.mock('./EditRecordForm', () => ({
    default: ({ onClose }) => (
        <div>
            <button onClick={() => onClose('unknown tag "onbaording"')}>Save with warning</button>
            <button onClick={() => onClose(undefined)}>Save cleanly</button>
        </div>
    ),
}));

const record = {
    id: 'finding:example',
    kind: 'finding',
    title: 'Example finding',
    date: '2026-01-02',
    type: 'synthesis',
    tags: [],
    html: '<p>Body</p>',
};

// Carbon's Modal measures itself with ResizeObserver, which jsdom lacks.
beforeAll(() => {
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

beforeEach(() => {
    useRecord.mockReturnValue({ isLoading: false, isError: false, data: record });
    useDeleteRecord.mockReturnValue({ mutate: vi.fn(), isError: false });
    useRecordHistory.mockReturnValue({ isLoading: false, isError: false });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RecordDetail — save warning', () => {
    it('shows the backend warning on the record view and refocuses Edit after a save with a warning', async () => {
        const user = userEvent.setup();
        render(<RecordDetail id={record.id} onClose={vi.fn()} onDeleted={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        await user.click(screen.getByRole('button', { name: 'Save with warning' }));

        const status = screen.getByRole('status');
        expect(within(status).getByText('Saved, but the index reported issues')).toBeInTheDocument();
        expect(within(status).getByText('unknown tag "onbaording"')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
    });

    it('shows no warning after a clean save', async () => {
        const user = userEvent.setup();
        render(<RecordDetail id={record.id} onClose={vi.fn()} onDeleted={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        await user.click(screen.getByRole('button', { name: 'Save cleanly' }));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
    });
});

describe('RecordDetail — generated (read-only) records', () => {
    it('hides Edit and Delete, explains where to make changes, and keeps View history', () => {
        useRecord.mockReturnValue({
            isLoading: false,
            isError: false,
            data: { ...record, id: 'component:button', kind: 'component', type: 'component', read_only: true },
        });
        render(<RecordDetail id="component:button" onClose={vi.fn()} onDeleted={vi.fn()} />);

        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
        const note = screen.getByRole('status');
        expect(within(note).getByText('Generated from Figma')).toBeInTheDocument();
        expect(within(note).getByText(/edit it in Figma and re-run the token sync/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View history' })).toBeInTheDocument();
    });

    it('shows Edit and Delete for a normal record', () => {
        useRecord.mockReturnValue({ isLoading: false, isError: false, data: { ...record, read_only: false } });
        render(<RecordDetail id={record.id} onClose={vi.fn()} onDeleted={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
        expect(screen.queryByText('Generated from Figma')).not.toBeInTheDocument();
    });
});
