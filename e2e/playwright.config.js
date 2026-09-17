import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    use: {
        baseURL: 'http://localhost:5173',
    },
    webServer: [
        {
            command: 'npm run dev',
            cwd: '../frontend',
            url: 'http://localhost:5173',
            reuseExistingServer: true, // safe — the frontend dev server touches no data
        },
        {
            command: 'node server.js',
            cwd: '../backend',
            url: 'http://localhost:3001/api/auth/me',
            env: { NODE_ENV: 'test' }, // routes signup/session writes to app.test.0.db, not your real app.db
            reuseExistingServer: false, // deliberately NOT true — if a real dev-mode backend is already on :3001, we want Playwright to fail loudly, not silently reuse it and write real signup data
        },
    ],
});