import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Composer from './Composer';

// Carbon's TextArea measures itself via ResizeObserver, which doesn't exist
// in jsdom. Same stub as CreateSessionForm.test.jsx.
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

describe('Composer', () => {
    it('calls onChange with each typed character', async () => {
        // `value` stays fixed at "" here (onChange is a plain mock, not
        // wired back into a controlled value), so a real caller like
        // ChatPanel would see these calls accumulate into "hi" — this
        // just confirms each keystroke is reported.
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Composer value="" onChange={onChange} onSend={() => {}} sending={false} />);

        await user.type(screen.getByLabelText('Ask a question about the research'), 'hi');

        expect(onChange).toHaveBeenNthCalledWith(1, 'h');
        expect(onChange).toHaveBeenNthCalledWith(2, 'i');
    });

    it('disables the send button when the value is empty', () => {
        render(<Composer value="" onChange={() => {}} onSend={() => {}} sending={false} />);

        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('sends on click with no arguments, not the click event', async () => {
        const user = userEvent.setup();
        const onSend = vi.fn();
        render(<Composer value="hello" onChange={() => {}} onSend={onSend} sending={false} />);

        await user.click(screen.getByRole('button', { name: 'Send' }));

        expect(onSend).toHaveBeenCalledWith();
    });

    it('sends on Enter but not on Shift+Enter', async () => {
        const user = userEvent.setup();
        const onSend = vi.fn();
        render(<Composer value="hello" onChange={() => {}} onSend={onSend} sending={false} />);

        const field = screen.getByLabelText('Ask a question about the research');
        await user.type(field, '{Shift>}{Enter}{/Shift}');
        expect(onSend).not.toHaveBeenCalled();

        await user.type(field, '{Enter}');
        expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('disables the field and button while sending', () => {
        render(<Composer value="hello" onChange={() => {}} onSend={() => {}} sending />);

        expect(screen.getByLabelText('Ask a question about the research')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('disables the field and button when asking is unavailable', () => {
        render(<Composer value="hello" onChange={() => {}} onSend={() => {}} sending={false} disabled />);

        expect(screen.getByLabelText('Ask a question about the research')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('limits a question to the endpoint\'s 2000 characters', () => {
        render(<Composer value="" onChange={() => {}} onSend={() => {}} sending={false} />);

        expect(screen.getByLabelText('Ask a question about the research')).toHaveAttribute('maxlength', '2000');
    });

    it('says each question is answered on its own', () => {
        render(<Composer value="" onChange={() => {}} onSend={() => {}} sending={false} />);

        expect(screen.getByText('Each question is answered on its own, without earlier ones as context.')).toBeInTheDocument();
    });
});
