// Playwright's webServer command for the backend. Builds a throwaway
// agentic-repo from fixtures/corpus, runs server.js against it, and deletes
// it when Playwright stops the server. E2E deletes records, so it must never
// see the real checkout backend/.env points at; AGENTIC_REPO_ROOT set here
// wins over .env (dotenv doesn't override variables already set).
//
// With LLM_PROVIDER=ollama (the main config), it also starts the backend
// tests' fake Ollama and points the backend at it, so Ask the Repo answers
// without a real model (CI has none).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTestRepo, destroyTestRepo } = require('../../backend/tests/helpers/setupTestRepo');
const { isThrowawayRepo } = require('../../backend/throwawayRepo');
const { startFakeOllama } = require('../../backend/tests/helpers/fakeOllama');

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

// What the fake model answers every question with: two citations, so the
// Ask spec has a [1] to click. The backend renumbers them against the
// passages it actually retrieved (deterministic, from the fake embeddings).
const FAKE_ANSWER = 'Physicians did not trust the draft enough to skim it [1].\n\nMedication dosages were garbled in several sessions [2].';

async function start() {
    const env = { ...process.env, AGENTIC_REPO_ROOT: repo };
    let fakeOllama = null;
    if (process.env.LLM_PROVIDER === 'ollama') {
        fakeOllama = await startFakeOllama({ chatReply: () => FAKE_ANSWER });
        Object.assign(env, {
            OLLAMA_BASE_URL: fakeOllama.url,
            OLLAMA_EMBED_MODEL: 'nomic-embed-text',
            OLLAMA_CHAT_MODEL: 'gemma2:9b',
        });
        console.log(`E2E backend using fake Ollama at ${fakeOllama.url}`);
    }

    const server = spawn(process.execPath, ['server.js'], {
        cwd: BACKEND_DIR,
        env,
        stdio: 'inherit',
    });

    // Playwright stops the server with SIGTERM (gracefulShutdown in the configs).
    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, () => {
            fakeOllama?.close();
            server.kill(signal);
        });
    }

    server.on('exit', async (code, signal) => {
        await destroyTestRepo(repo);
        process.exit(code ?? (signal ? 0 : 1));
    });
}

start();
