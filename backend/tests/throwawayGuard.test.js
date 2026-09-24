const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

// Jest and the Playwright backend both run with NODE_ENV=test and delete,
// edit and commit records, so they must never reach a real agentic-repo.

const savedEnv = { ...process.env };
const tempDirs = [];

function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'throwaway-guard-'));
    tempDirs.push(dir);
    return dir;
}

// records.js checks AGENTIC_REPO_ROOT once, at load time.
function loadRecordsRoute() {
    let router;
    jest.isolateModules(() => {
        router = require('../routes/records');
    });
    return router;
}

afterEach(async () => {
    process.env = { ...savedEnv };
    for (const dir of tempDirs.splice(0)) {
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
});

describe('throwaway-repo guard', () => {
    it('refuses to load under test when AGENTIC_REPO_ROOT is unset or not a throwaway repo', () => {
        delete process.env.AGENTIC_REPO_ROOT;
        expect(loadRecordsRoute).toThrow(/AGENTIC_REPO_ROOT is not set/);

        // A real-looking git checkout without the marker, like the one
        // backend/.env points at.
        const realLooking = makeTempDir();
        execFileSync('git', ['init', '-q'], { cwd: realLooking });
        process.env.AGENTIC_REPO_ROOT = realLooking;
        expect(loadRecordsRoute).toThrow(/Refusing to start under NODE_ENV=test/);
    });

    it('loads against a throwaway repo from createTestRepo()', async () => {
        const repo = createTestRepo();
        try {
            process.env.AGENTIC_REPO_ROOT = repo;
            expect(loadRecordsRoute).not.toThrow();
        } finally {
            await destroyTestRepo(repo);
        }
    });

    it('createTestRepo() explains what to set when it cannot find the real scripts', () => {
        process.env.REAL_AGENTIC_REPO_ROOT = makeTempDir();
        let helper;
        jest.isolateModules(() => {
            helper = require('./helpers/setupTestRepo');
        });
        expect(() => helper.createTestRepo()).toThrow(/No agentic-repo scripts at .*Set REAL_AGENTIC_REPO_ROOT/);
    });
});
