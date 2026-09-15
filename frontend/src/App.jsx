import { useMe } from './api/auth';
import LoginForm from './LoginForm';

function App() {
  const me = useMe();

  if (me.isLoading) {
    return <p>Loading…</p>;
  }

  if (me.isError) {
    return <LoginForm onLoginSuccess={() => me.refetch()} />;
  }

  return <p>Logged in as {me.data.username}!</p>;
}

export default App;