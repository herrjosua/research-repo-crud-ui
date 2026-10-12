import { SkipToContent } from '@carbon/react';

/**
 * A skip link (v1.3.6.63): a link that is hidden until it has keyboard
 * focus, and moves focus to the element with id `targetId`. Carbon's
 * SkipToContent supplies the link and its focus styles; this wraps it so
 * the page can hand focus to the target itself rather than change the URL
 * hash (the app has no router), and so every skip link behaves the same.
 * The target must be able to take focus: an element with `tabIndex={-1}`,
 * or one that is already focusable.
 */
export default function SkipLink({ targetId, children }) {
    return (
        <SkipToContent
            href={`#${targetId}`}
            onClick={(event) => {
                event.preventDefault();
                document.getElementById(targetId)?.focus();
            }}
        >
            {children}
        </SkipToContent>
    );
}
