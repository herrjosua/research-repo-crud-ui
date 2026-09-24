// Playwright's webServer command for the backend. Builds a throwaway
// agentic-repo from fixtures/corpus, runs server.js against it, and deletes
// it when Playwright stops the server. E2E deletes records, so it must never
// see the real checkout backend/.env points at; AGENTIC_REPO_ROOT set here
// wins over .env (dotenv doesn't override variables already set).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestRepo, destroyTestRepo } = require('../../backend/tests/helpers/setupTestRepo');
const { isThrowawayRepo } = require('../../backend/throwawayRepo');

const BACKEND_DIR = path.resolve(__dirname, '../../backend');
const CORPUS_DIR = path.resolve(__dirname, '../fixtures/corpus');

const repo = createTestRepo({ corpusDir: CORPUS_DIR });

// The backend refuses a non-throwaway repo under NODE_ENV=test anyway; check
// here too, before the server ever starts.
const tmpRoot = fs.realpathSync(os.tmpdir()) + path.sep;
if (!fs.realpathSync(repo).startsWith(tmpRoot) || !isThrowawayRepo(repo)) {
    throw new Error(`E2E backend repo ${repo} is not a throwaway repo under ${tmpRoot}`);
}
console.log(`E2E backend using throwaway repo ${repo}`);

const server = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, AGENTIC_REPO_ROOT: repo },
    stdio: 'inherit',
});

// Playwright stops the server with SIGTERM (gracefulShutdown in the configs).
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.kill(signal));
}

server.on('exit', async (code, signal) => {
    await destroyTestRepo(repo);
    process.exit(code ?? (signal ? 0 : 1));
});
