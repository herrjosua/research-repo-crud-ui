import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests-demo',
    use: {
        baseURL: 'http://localhost:5173',
    },
    webServer: [
        {
            command: 'npm run dev',
            cwd: '../frontend',
            url: 'http://localhost:5173',
            reuseExistingServer: true,
        },
        {
            command: 'node server.js',
            cwd: '../backend',
            url: 'http://localhost:3001/api/auth/me',
            env: { NODE_ENV: 'test', DEMO_MODE: 'true' },
            reuseExistingServer: false,
        },
    ],
});