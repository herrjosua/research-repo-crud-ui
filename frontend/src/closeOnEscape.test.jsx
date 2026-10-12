import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { closeOnEscapeFromCloseButton } from './closeOnEscape';

function renderDialogLike(onClose, onOutsideKey = vi.fn()) {
    render(
        <div onKeyDown={onOutsideKey}>
            <div data-testid="dialog" onKeyDownCapture={closeOnEscapeFromCloseButton(onClose)}>
                <button className="cds--modal-close">Close</button>
                <button>Other</button>
            </div>
        </div>,
    );
}

describe('closeOnEscapeFromCloseButton (v1.3.6.64)', () => {
    it('closes on Escape from the Close button, before anything else sees the key', async () => {
        const onClose = vi.fn();
        const onOutsideKey = vi.fn();
        const user = userEvent.setup();
        renderDialogLike(onClose, onOutsideKey);

        screen.getByRole('button', { name: 'Close' }).focus();
        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onOutsideKey).not.toHaveBeenCalled();
    });

    it('leaves Escape alone anywhere else in the dialog, and other keys on Close', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        renderDialogLike(onClose);

        screen.getByRole('button', { name: 'Other' }).focus();
        await user.keyboard('{Escape}');
        screen.getByRole('button', { name: 'Close' }).focus();
        await user.keyboard('a');

        expect(onClose).not.toHaveBeenCalled();
    });
});
