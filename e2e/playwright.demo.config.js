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
            // LLM_PROVIDER=static, like the public demo: visitors pick from
            // captured questions. start-backend.js layers a project list
            // over the corpus and serves fixtures/static-answers.json (test-
            // only ASK_STATIC_ANSWERS_FILE), never the real answers file.
            // Set explicitly so an LLM_PROVIDER in backend/.env can't leak in
            // (dotenv never overrides a variable that's already set).
            // DEV_TOOLS_ENABLED false for the same reason: the public demo
            // never has the dev-only provider toggle.
            env: { NODE_ENV: 'test', DEMO_MODE: 'true', LLM_PROVIDER: 'static', DEV_TOOLS_ENABLED: 'false' },
            reuseExistingServer: false,
            // Lets start-backend.js delete the throwaway repo on the way out.
            gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
        },
    ],
});