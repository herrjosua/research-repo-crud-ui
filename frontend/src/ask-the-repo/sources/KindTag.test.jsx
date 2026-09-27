import { render, screen } from '@testing-library/react';
import KindTag from './KindTag';
import { KIND_META } from './kindMeta';
import styles from './KindTag.module.scss';

describe('KindTag', () => {
    it.each(Object.entries(KIND_META))('renders the %s label', (kind, meta) => {
        render(<KindTag kind={kind} />);
        expect(screen.getByText(meta.label)).toBeInTheDocument();
    });

    it.each(Object.entries(KIND_META))(
        'gives %s the Carbon Tag color from kindMeta (or gray, for the one color Carbon has no Tag type for)',
        (kind, meta) => {
            render(<KindTag kind={kind} />);
            const expectedType = meta.tagType === 'orange' ? 'gray' : meta.tagType;
            expect(screen.getByText(meta.label).closest('.cds--tag')).toHaveClass(`cds--tag--${expectedType}`);
        }
    );

    it('layers the orange modifier only on the kind Carbon has no native Tag color for', () => {
        render(<KindTag kind="transcript" />);
        expect(screen.getByText('Transcript').closest('.cds--tag')).toHaveClass(styles.orange);
    });

    it('does not add the orange modifier to kinds with a native Carbon Tag color', () => {
        render(<KindTag kind="doc" />);
        expect(screen.getByText('Doc').closest('.cds--tag')).not.toHaveClass(styles.orange);
    });
});
