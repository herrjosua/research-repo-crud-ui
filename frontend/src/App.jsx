import { Grid, Column } from '@carbon/react';
import { useMe, useDemoUsers } from './api/auth';
import LoginForm from './LoginForm';
import DemoUserPicker from './DemoUserPicker';
import DemoDisclaimer from './DemoDisclaimer';
import Dashboard from './Dashboard';
import AppHeader from './Header';

import styles from './App.module.scss';

function App() {
    const me = useMe();
    const demoUsers = useDemoUsers();
    // The backend returns [] unless DEMO_MODE is on; a failed request leaves
    // data undefined, which also counts as not-demo.
    const isDemo = demoUsers.data?.length > 0;

    let content;

    if (me.isLoading || demoUsers.isLoading) {
        content = <p>Loading…</p>;
    } else if (me.isError) {
        content = isDemo
            ? <DemoUserPicker onLoginSuccess={() => me.refetch()} />
            : <LoginForm onLoginSuccess={() => me.refetch()} />;
    } else {
        content = (
            <>
                <AppHeader />
                {isDemo && (
                    <Grid>
                        <Column sm={4} md={8} lg={16}>
                            <DemoDisclaimer />
                        </Column>
                    </Grid>
                )}
                <Dashboard />
            </>
        );
    }

    return (
        <>
            <main className={styles.main}>
                {content}
            </main>
            <footer className={styles.footer}>v{__APP_VERSION__}</footer>
        </>
    );
}

export default App;
