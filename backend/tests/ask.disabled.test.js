const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const { listenOnLoopback } = require('./helpers/loopbackServer');

// POST /api/ask with LLM_PROVIDER unset: the route exists but is switched off.
// Its own file because routes/ask.js reads LLM_PROVIDER once, at load time.

let testRepoPath;
let app, sessionDb, clearSessionInterval, db, server, agent;

beforeAll(async () => {
    testRepoPath = createTestRepo();
    process.env.AGENTIC_REPO_ROOT = testRepoPath;
    // Empty rather than deleted: dotenv (app.js) never overrides a variable
    // that's already set, so this also wins over an LLM_PROVIDER in backend/.env.
    process.env.LLM_PROVIDER = '';

    const request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    server = await listenOnLoopback(app);
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('ask-disabled-tester');
    agent = request.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'ask-disabled-tester',
        password: 'a-real-password-123',
        gitName: 'Ask Disabled Tester',
        gitEmail: 'ask-disabled-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(`ask.disabled.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
    }
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    server.close();
    delete process.env.AGENTIC_REPO_ROOT;
    delete process.env.LLM_PROVIDER;
    await destroyTestRepo(testRepoPath);
});

it('answers 503 when LLM_PROVIDER is not set', async () => {
    const res = await agent.post('/api/ask').send({ question: 'anything' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'ask the repo is not enabled on this server' });
});

it('still answers GET /api/ask/config, with enabled false and no mode', async () => {
    const res = await agent.get('/api/ask/config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, mode: null, projects: [] });
});
