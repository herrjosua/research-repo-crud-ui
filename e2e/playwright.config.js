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
            // Runs server.js against a throwaway repo built from
            // fixtures/corpus, never the real agentic-repo in backend/.env.
            command: 'node support/start-backend.js',
            url: 'http://localhost:3001/api/auth/me',
            env: { NODE_ENV: 'test', DEMO_MODE: 'false' }, // explicit, independent of whatever's in backend/.env
            reuseExistingServer: false,
            // Lets start-backend.js delete the throwaway repo on the way out.
            gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
        },
    ],
});