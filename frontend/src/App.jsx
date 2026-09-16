import { useMe } from './api/auth';
import LoginForm from './LoginForm';
import Dashboard from './Dashboard';

function App() {
  const me = useMe();

  if (me.isLoading) {
    return <p>Loading…</p>;
  }

  if (me.isError) {
    return <LoginForm onLoginSuccess={() => me.refetch()} />;
  }

  return <Dashboard />;
}

export default App;