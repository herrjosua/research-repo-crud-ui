const request = require('supertest');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

// GET /api/health, which scripts/deploy.sh polls after a restart to confirm
// the new release is live. Loads the whole app so the route is tested where
// it's actually mounted.
const testRepoPath = createTestRepo();
process.env.AGENTIC_REPO_ROOT = testRepoPath;

const { app, sessionDb, clearSessionInterval } = require('../app');
const db = require('../db');
const { version } = require('../package.json');

let server;

beforeAll(() => {
    server = app.listen(0);
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    server.close();
    delete process.env.AGENTIC_REPO_ROOT;
    await destroyTestRepo(testRepoPath);
});

describe('GET /api/health', () => {
    it('returns ok with the backend package version, unauthenticated', async () => {
        const res = await request(server).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.version).toBe(version);
    });

    it('reports when this process started, as an ISO timestamp in the past', async () => {
        const res = await request(server).get('/api/health');
        const startedAt = Date.parse(res.body.startedAt);
        expect(new Date(startedAt).toISOString()).toBe(res.body.startedAt);
        expect(startedAt).toBeLessThanOrEqual(Date.now());
    });

    it('is never cached', async () => {
        const res = await request(server).get('/api/health');
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('exposes nothing beyond status, version and startedAt', async () => {
        const res = await request(server).get('/api/health');
        expect(Object.keys(res.body).sort()).toEqual(['startedAt', 'status', 'version']);
    });

    it('ignores a cache-busting query string', async () => {
        const res = await request(server).get('/api/health?deploy=123');
        expect(res.status).toBe(200);
    });
});
