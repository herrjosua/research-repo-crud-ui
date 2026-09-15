import { useState } from 'react';
import LoginForm from './LoginForm';

function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  if (loggedIn) {
    return <p>You're logged in!</p>;
  }

  return <LoginForm onLoginSuccess={() => setLoggedIn(true)} />;
}

export default App;