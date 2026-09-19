import { useMe, useDemoUsers } from './api/auth';
import LoginForm from './LoginForm';
import DemoUserPicker from './DemoUserPicker';
import Dashboard from './Dashboard';
import AppHeader from './Header';

import styles from './App.module.scss';

function App() {
    const me = useMe();
    const demoUsers = useDemoUsers();

    let content;

    if (me.isLoading || demoUsers.isLoading) {
        content = <p>Loading…</p>;
    } else if (me.isError) {
        content = demoUsers.data && demoUsers.data.length > 0
            ? <DemoUserPicker onLoginSuccess={() => me.refetch()} />
            : <LoginForm onLoginSuccess={() => me.refetch()} />;
    } else {
        content = (
            <>
                <AppHeader />
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
