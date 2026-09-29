const express = require('express');
const request = require('supertest');
const { devToolsGate, mountDevTools } = require('../devTools');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

// The dev-tools gate: /api/dev is registered only with DEV_TOOLS_ENABLED=true
// and NODE_ENV development or test, and never exists otherwise. Tested from
// outside: on a bare app with only the dev routes and the /api catch-all, an
// unauthenticated request gets 401 when they're registered (requireAuth) and
// 404 when not. In the full app every unknown /api path is 401 without a
// session (the records router's requireAuth), so there the check is signed
// in: 404 when not registered. Loading app.js under NODE_ENV=production would
// open the real app.db, so the production cases mount through mountDevTools
// (what app.js calls) on a bare app; the app.js wiring itself is checked
// below, under Jest's NODE_ENV=test.

describe('devToolsGate', () => {
    it.each([
        ['true', 'development'],
        ['true', 'test'],
    ])('allows DEV_TOOLS_ENABLED=%j with NODE_ENV=%j', (flag, nodeEnv) => {
        expect(devToolsGate({ DEV_TOOLS_ENABLED: flag, NODE_ENV: nodeEnv })).toEqual({ enabled: true, reason: null });
    });

    it.each([
        ['production', /NODE_ENV is "production", not "development" or "test"/],
        [undefined, /NODE_ENV is unset, not "development" or "test"/],
        ['', /NODE_ENV is "", not "development" or "test"/],
        ['staging', /NODE_ENV is "staging"/],
        ['Development', /NODE_ENV is "Development"/],
    ])('refuses DEV_TOOLS_ENABLED=true with NODE_ENV=%j, and says why', (nodeEnv, why) => {
        const gate = devToolsGate({ DEV_TOOLS_ENABLED: 'true', NODE_ENV: nodeEnv });
        expect(gate.enabled).toBe(false);
        expect(gate.reason).toMatch(why);
        expect(gate.reason).toMatch(/DEV_TOOLS_ENABLED=true is ignored/);
    });

    it.each([undefined, '', 'false', 'TRUE', '1', 'yes', ' true'])('is off, silently, with DEV_TOOLS_ENABLED=%j', (flag) => {
        expect(devToolsGate({ DEV_TOOLS_ENABLED: flag, NODE_ENV: 'development' })).toEqual({ enabled: false, reason: null });
    });
});

describe('mountDevTools', () => {
    // app.js's shape around the mount: a session, then the dev routes (or
    // not), then the /api JSON 404.
    function appWith(env) {
        const warn = jest.fn();
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => { req.session = {}; next(); });
        const mounted = mountDevTools(app, env, { warn });
        app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
        return { app, warn, mounted };
    }

    it.each([
        [{ NODE_ENV: 'production', DEV_TOOLS_ENABLED: 'true' }],
        [{ DEV_TOOLS_ENABLED: 'true' }],
        [{ NODE_ENV: 'production' }],
        [{ NODE_ENV: 'development' }],
    ])('registers nothing for %j: the route is a plain 404', async (env) => {
        const { app, mounted } = appWith(env);
        expect(mounted).toBe(false);
        for (const res of [
            await request(app).post('/api/dev/provider').send({ provider: 'static' }),
            await request(app).get('/api/dev/provider'),
        ]) {
            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'not found' });
        }
    });

    it('warns once, saying why, when the flag is set in production', () => {
        const { warn } = appWith({ NODE_ENV: 'production', DEV_TOOLS_ENABLED: 'true' });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe(
            '[dev tools] DEV_TOOLS_ENABLED=true is ignored: NODE_ENV is "production", not "development" or "test". The /api/dev routes are not registered.',
        );
    });

    it('does not warn when the flag is simply off', () => {
        const { warn } = appWith({ NODE_ENV: 'production' });
        expect(warn).not.toHaveBeenCalled();
    });

    it.each(['development', 'test'])('registers the routes under NODE_ENV=%j (unauthenticated: 401)', async (nodeEnv) => {
        const { app, mounted, warn } = appWith({ NODE_ENV: nodeEnv, DEV_TOOLS_ENABLED: 'true' });
        expect(mounted).toBe(true);
        expect(warn).not.toHaveBeenCalled();
        expect((await request(app).post('/api/dev/provider').send({ provider: 'static' })).status).toBe(401);
    });
});

describe('app.js without DEV_TOOLS_ENABLED', () => {
    let testRepoPath, app, sessionDb, clearSessionInterval, db, server, agent;

    beforeAll(async () => {
        testRepoPath = createTestRepo();
        process.env.AGENTIC_REPO_ROOT = testRepoPath;
        // Empty rather than deleted: dotenv never overrides a variable that's
        // already set, so this also wins over a flag in backend/.env.
        process.env.DEV_TOOLS_ENABLED = '';
        ({ app, sessionDb, clearSessionInterval } = require('../app'));
        db = require('../db');
        server = app.listen(0);
        delete process.env.DEMO_MODE;

        db.prepare('DELETE FROM users WHERE username = ?').run('dev-tools-off-tester');
        agent = request.agent(server);
        const signupRes = await agent.post('/api/auth/signup').send({
            username: 'dev-tools-off-tester',
            password: 'a-real-password-123',
            gitName: 'Dev Tools Off Tester',
            gitEmail: 'dev-tools-off-tester@example.com',
        });
        if (signupRes.status !== 201) throw new Error(`signup failed: ${JSON.stringify(signupRes.body)}`);
    });

    afterAll(async () => {
        db.close();
        sessionDb.close();
        clearSessionInterval();
        server.close();
        delete process.env.AGENTIC_REPO_ROOT;
        delete process.env.DEV_TOOLS_ENABLED;
        await destroyTestRepo(testRepoPath);
    });

    it('has no /api/dev routes, even for a signed-in user', async () => {
        for (const res of [
            await agent.post('/api/dev/provider').send({ provider: 'static' }),
            await agent.get('/api/dev/provider'),
        ]) {
            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'not found' });
        }
    });
});
