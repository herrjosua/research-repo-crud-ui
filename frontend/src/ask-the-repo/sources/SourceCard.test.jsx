import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourceCard from './SourceCard';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';
import styles from './SourceCard.module.scss';

const [interview, , , synthesis] = INITIAL_MESSAGES_BY_CONVERSATION.c1[1].sources;

describe('SourceCard', () => {
    it('renders the kind tag, page, title, excerpt, and project/date', () => {
        render(<SourceCard source={interview} onOpen={() => {}} onTogglePin={() => {}} />);

        expect(screen.getByText('Interview')).toBeInTheDocument();
        expect(screen.getByText('p. 7')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: interview.title })).toBeInTheDocument();
        expect(screen.getByText(`“${interview.excerpt}”`)).toBeInTheDocument();
        expect(screen.getByText(`${interview.project} · ${interview.date}`)).toBeInTheDocument();
    });

    it('opens via its title button', async () => {
        const user = userEvent.setup();
        const onOpen = vi.fn();
        render(<SourceCard source={interview} onOpen={onOpen} onTogglePin={() => {}} />);

        await user.click(screen.getByRole('button', { name: interview.title }));

        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('toggles the pin without also opening the source', async () => {
        const user = userEvent.setup();
        const onOpen = vi.fn();
        const onTogglePin = vi.fn();
        render(<SourceCard source={interview} onOpen={onOpen} onTogglePin={onTogglePin} />);

        await user.click(screen.getByRole('button', { name: 'Pin as top finding' }));

        expect(onTogglePin).toHaveBeenCalledTimes(1);
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('shows the pinned state as a pressed toggle', () => {
        render(<SourceCard source={interview} pinned onOpen={() => {}} onTogglePin={() => {}} />);

        expect(screen.getByRole('button', { name: 'Pinned as top finding' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('offers no pin for kinds that are not primary evidence', () => {
        render(<SourceCard source={synthesis} onOpen={() => {}} onTogglePin={() => {}} />);

        expect(screen.queryByRole('button', { name: /top finding/ })).not.toBeInTheDocument();
    });

    it('marks the selected card', () => {
        render(<SourceCard source={interview} selected onOpen={() => {}} onTogglePin={() => {}} />);

        expect(screen.getByRole('article')).toHaveClass(styles.selected);
    });
});
