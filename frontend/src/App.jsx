import { useMe, useDemoUsers } from './api/auth';
import LoginForm from './LoginForm';
import DemoUserPicker from './DemoUserPicker';
import Dashboard from './Dashboard';
import AppHeader from './Header';

import styles from './App.module.scss';

function App() {
    const me = useMe();
    const demoUsers = useDemoUsers();

    if (me.isLoading || demoUsers.isLoading) {
        return <p>Loading…</p>;
    }

    if (me.isError) {
        if (demoUsers.data && demoUsers.data.length > 0) {
            return <DemoUserPicker onLoginSuccess={() => me.refetch()} />;
        }
        return <LoginForm onLoginSuccess={() => me.refetch()} />;
    }

    return (
        <>
            <AppHeader />
            <main className={styles.main}>
                <Dashboard />
            </main>
        </>
    );
}

export default App;