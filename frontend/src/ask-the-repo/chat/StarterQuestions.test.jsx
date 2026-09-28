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

    it('disables every question when disabled', () => {
        render(<StarterQuestions questions={QUESTIONS} onSelect={() => {}} disabled />);

        for (const question of QUESTIONS) {
            expect(screen.getByRole('button', { name: question })).toBeDisabled();
        }
    });
});
