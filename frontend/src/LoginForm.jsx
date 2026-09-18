import { useState } from 'react';
import { Form, Stack, TextInput, PasswordInput, Button, InlineNotification } from '@carbon/react';
import { useLogin } from './api/auth';

export default function LoginForm({ onLoginSuccess }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const login = useLogin();

    function handleSubmit(event) {
        event.preventDefault();
        login.mutate(
            { username, password },
            { onSuccess: onLoginSuccess },
        );
    }

    return (
        <>
            <h1>Log in</h1>
            <Form onSubmit={handleSubmit} aria-label="Log in">
                <Stack gap={6}>
                    <TextInput
                        id="username"
                        labelText="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                    <PasswordInput
                        id="password"
                        labelText="Password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    {login.isError && (
                        <InlineNotification
                            kind="error"
                            title="Login failed"
                            subtitle={login.error.message}
                            lowContrast
                        />
                    )}
                    <Button type="submit" disabled={login.isPending}>
                        {login.isPending ? 'Logging in…' : 'Log in'}
                    </Button>
                </Stack>
            </Form>
        </>
    );
}