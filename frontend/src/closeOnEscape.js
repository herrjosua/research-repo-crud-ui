// Escape pressed while focus is on a dialog's Close button (v1.3.6.64).
//
// Carbon shows Close's tooltip as soon as it takes focus, and the tooltip
// swallows the first Escape to dismiss itself, so the dialog stayed open and
// the user had to press Escape twice. Passed to a Modal as onKeyDownCapture, so
// it runs before the tooltip sees the key, it closes the dialog on the first
// press. Only a key that starts inside this dialog counts: a dialog stacked on
// top is portaled elsewhere in the page, so its Escape does not close this one.
export function closeOnEscapeFromCloseButton(onClose) {
    return (event) => {
        if (event.key !== 'Escape') return;
        const { target, currentTarget } = event;
        if (!(target instanceof Element) || !currentTarget.contains(target)) return;
        if (!target.closest('.cds--modal-close')) return;
        event.preventDefault();
        event.stopPropagation();
        onClose(event);
    };
}
