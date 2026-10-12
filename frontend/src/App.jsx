import { useState } from 'react';
import { Grid, Column } from '@carbon/react';
import { useMe, useDemoUsers } from './api/auth';
import LoginForm from './LoginForm';
import DemoUserPicker from './DemoUserPicker';
import DemoDisclaimer from './DemoDisclaimer';
import Dashboard from './Dashboard';
import AskTheRepo from './ask-the-repo/AskTheRepo';
import AppHeader from './Header';
import SkipLink from './SkipLink';

import styles from './App.module.scss';

function App() {
    const me = useMe();
    const demoUsers = useDemoUsers();
    const [activeSection, setActiveSection] = useState('dashboard');
    // The backend returns [] unless DEMO_MODE is on; a failed request leaves
    // data undefined, which also counts as not-demo.
    const isDemo = demoUsers.data?.length > 0;

    let content;
    // Outside <main>: a <header> inside <main> is not a banner landmark, so the
    // screen reader would not list it as one (v1.3.6.63). The header is fixed,
    // so where it sits in the DOM does not move it.
    let header = null;
    // Only Ask the Repo fills the viewport (its rail/chat row scrolls
    // internally); every other page grows with its content and lets the
    // page scroll. See `.fillViewport` in App.module.scss.
    let fillsViewport = false;

    if (me.isLoading || demoUsers.isLoading) {
        content = (
            <Grid>
                <Column sm={4} md={8} lg={16}>
                    <p className={styles.loading}>Loading…</p>
                </Column>
            </Grid>
        );
    } else if (me.isError) {
        content = isDemo
            ? <DemoUserPicker onLoginSuccess={() => me.refetch()} />
            : <LoginForm onLoginSuccess={() => me.refetch()} />;
    } else {
        fillsViewport = activeSection === 'ask-the-repo';
        header = (
            <>
                <SkipLink targetId="main-content">Skip to main content</SkipLink>
                <AppHeader activeSection={activeSection} onNavigate={setActiveSection} />
            </>
        );
        content = (
            <>
                {isDemo && (
                    <Grid>
                        <Column sm={4} md={8} lg={16}>
                            <DemoDisclaimer />
                        </Column>
                    </Grid>
                )}
                {activeSection === 'ask-the-repo' ? <AskTheRepo /> : <Dashboard />}
            </>
        );
    }

    return (
        <>
            {header}
            {/* tabIndex -1: the skip link's target. */}
            <main id="main-content" tabIndex={-1} className={fillsViewport ? `${styles.main} ${styles.fillViewport}` : styles.main}>
                {content}
            </main>
            <footer className={styles.footer}>v{__APP_VERSION__}</footer>
        </>
    );
}

export default App;
