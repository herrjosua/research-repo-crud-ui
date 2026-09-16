import { useMe } from './api/auth';
import LoginForm from './LoginForm';
import Dashboard from './Dashboard';
import AppHeader from './Header';

import styles from './App.module.scss';

function App() {
  const me = useMe();

  if (me.isLoading) {
    return <p>Loading…</p>;
  }

  if (me.isError) {
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