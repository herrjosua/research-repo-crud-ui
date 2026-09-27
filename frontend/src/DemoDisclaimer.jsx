import { Callout } from '@carbon/react';
import styles from './DemoDisclaimer.module.scss';

/**
 * Permanent "demonstration environment" notice, shown ahead of the demo
 * account picker (`DemoUserPicker`) and standalone on the login screen
 * (`App`) so the disclaimer is visible before a user picks or logs into
 * an account.
 *
 * Renders as a Carbon `Callout` rather than `InlineNotification`: this
 * notice is permanent page content, not an event. `InlineNotification` is
 * always a live region (`role="status"`), so screen readers would announce
 * it on every mount — including after each login. `Callout` has no role
 * and is read in order.
 *
 * `className` (optional): extra class name(s) merged onto the root
 * `Callout`, for layout adjustments in the parent (e.g. spacing).
 */
export default function DemoDisclaimer({ className }) {
    return (
        <Callout
            className={className ? `${styles.disclaimer} ${className}` : styles.disclaimer}
            kind="info"
            title="Demonstration environment"
            subtitle="This is a demonstration environment using fictional sample data for a hypothetical organization. No real people, patients, or protected information are represented. Content resets automatically every hour."
            lowContrast
        />
    );
}
