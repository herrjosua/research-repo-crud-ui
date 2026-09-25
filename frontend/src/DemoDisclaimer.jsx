import { Callout } from '@carbon/react';
import styles from './DemoDisclaimer.module.scss';

// Callout rather than InlineNotification: this notice is permanent page
// content, not an event. InlineNotification is always a live region
// (role="status"), so screen readers would announce it on every mount —
// including after each login. Callout has no role and is read in order.
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
