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
            // Runs server.js against a throwaway repo built from
            // fixtures/corpus, never the real agentic-repo in backend/.env.
            command: 'node support/start-backend.js',
            url: 'http://localhost:3001/api/auth/me',
            // LLM_PROVIDER empty, like the public demo: Ask the Repo is off.
            // Set explicitly so an LLM_PROVIDER in backend/.env can't leak in
            // (dotenv never overrides a variable that's already set).
            env: { NODE_ENV: 'test', DEMO_MODE: 'true', LLM_PROVIDER: '' },
            reuseExistingServer: false,
            // Lets start-backend.js delete the throwaway repo on the way out.
            gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
        },
    ],
});