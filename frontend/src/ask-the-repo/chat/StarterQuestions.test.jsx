import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StarterQuestions from './StarterQuestions';

const QUESTIONS = ['What are the top pain points?', 'Why do users abandon before payment?'];

describe('StarterQuestions', () => {
    it('renders every question', () => {
        render(<StarterQuestions questions={QUESTIONS} onSelect={() => {}} />);

        QUESTIONS.forEach((question) => {
            expect(screen.getByRole('button', { name: question })).toBeInTheDocument();
        });
    });

    it('calls onSelect with the clicked question, not the click event', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(<StarterQuestions questions={QUESTIONS} onSelect={onSelect} />);

        await user.click(screen.getByRole('button', { name: QUESTIONS[1] }));

        expect(onSelect).toHaveBeenCalledWith(QUESTIONS[1]);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('keys items by id and hands back the clicked item, even when two share wording', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        const items = [
            { id: 'all-billing', question: 'What did coders think?' },
            { id: 'rcm-billing', question: 'What did coders think?' },
        ];
        render(<StarterQuestions questions={items} onSelect={onSelect} />);

        const buttons = screen.getAllByRole('button', { name: 'What did coders think?' });
        expect(buttons).toHaveLength(2);
        await user.click(buttons[1]);

        expect(onSelect).toHaveBeenCalledExactlyOnceWith(items[1]);
    });
});
