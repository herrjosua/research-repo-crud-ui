import { useDemoUsers, useDemoLogin } from './api/auth';
import { InlineNotification } from '@carbon/react';
import DemoDisclaimer from './DemoDisclaimer';
import styles from './DemoUserPicker.module.scss';

function initials(name) {
    return name.split(' ').map((part) => part[0]).join('');
}

export default function DemoUserPicker({ onLoginSuccess }) {
    const demoUsers = useDemoUsers();
    const demoLogin = useDemoLogin();

    function handleSelect(username) {
        demoLogin.mutate(username, { onSuccess: onLoginSuccess });
    }

    return (
        <div className={styles.container}>
            <h1>Choose a demo account</h1>
            <p>This is a public demo — pick a profile to explore the app as that person.</p>

            <DemoDisclaimer />

            <div className={styles.grid}>
                {(demoUsers.data || []).map((user) => (
                    <button
                        key={user.username}
                        type="button"
                        className={styles.profileButton}
                        onClick={() => handleSelect(user.username)}
                        disabled={demoLogin.isPending}
                    >
            <span className={styles.avatar} aria-hidden="true">
              {initials(user.displayName)}
            </span>
                        <span className={styles.name}>{user.displayName}</span>
                        <span className={styles.role}>{user.role}</span>
                    </button>
                ))}
            </div>

            {demoLogin.isError && (
                <InlineNotification
                    kind="error"
                    title="Couldn't log in"
                    subtitle={demoLogin.error.message}
                    lowContrast
                />
            )}
        </div>
    );
}