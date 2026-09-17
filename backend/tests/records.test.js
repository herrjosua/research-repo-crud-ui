const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

let testRepoPath;
let app, sessionDb, clearSessionInterval;
let request, db, agent;

beforeAll(async () => {
    testRepoPath = createTestRepo();
    process.env.AGENTIC_REPO_ROOT = testRepoPath;

    // records.js reads AGENTIC_REPO_ROOT once, at module load time — so app.js
    // (which requires records.js) has to be required AFTER the env var above
    // is set, not at the top of this file like auth.test.js does. require()
    // is a plain function call in CommonJS, not hoisted like an ES import, so
    // this ordering is safe.
    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');

    // Records routes require a logged-in session — sign up and log in once
    // here, reusing the same agent (persistent cookie jar) for every test
    // below, the same pattern the auth tests used for the login/me/logout flow.
    agent = request.agent(app);
    await agent.post('/api/auth/signup').send({
        username: 'records-tester',
        password: 'a-real-password-123',
        gitName: 'Records Tester',
        gitEmail: 'records-tester@example.com',
    });
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    delete process.env.AGENTIC_REPO_ROOT;
    await destroyTestRepo(testRepoPath);
});

describe('fixture sanity check', () => {
    it('GET /api/records returns an empty array against a fresh fixture', async () => {
        const res = await agent.get('/api/records');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});