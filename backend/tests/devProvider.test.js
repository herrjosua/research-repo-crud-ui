const path = require('path');
const express = require('express');
const supertest = require('supertest');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const { startFakeOllama } = require('./helpers/fakeOllama');
const { listenOnLoopback } = require('./helpers/loopbackServer');

// The dev-only provider switch (routes/dev.js) end to end: the server starts
// with LLM_PROVIDER unset (Ask off), DEV_TOOLS_ENABLED=true, a fake Ollama,
// and the static answers fixture. Tests run in order and share the one
// in-memory provider, the way a developer's server would.

const CORPUS_DIR = path.join(__dirname, 'fixtures', 'projects-corpus');
const ANSWERS_FIXTURE = path.join(__dirname, 'fixtures', 'static-answers', 'answers.json');
const FAKE_ANSWER = 'Admins stalled on the calendar step [1].';

let testRepoPath;
let fakeOllama;
let app, sessionDb, clearSessionInterval, db, server, agent;

beforeAll(async () => {
    fakeOllama = await startFakeOllama({ chatReply: () => FAKE_ANSWER });
    testRepoPath = createTestRepo({ corpusDir: CORPUS_DIR });
    process.env.AGENTIC_REPO_ROOT = testRepoPath;
    // Empty rather than deleted, so backend/.env can't set it (dotenv never
    // overrides a variable that's already set).
    process.env.LLM_PROVIDER = '';
    process.env.DEV_TOOLS_ENABLED = 'true';
    process.env.ASK_STATIC_ANSWERS_FILE = ANSWERS_FIXTURE;
    process.env.OLLAMA_BASE_URL = fakeOllama.url;
    process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text';
    process.env.OLLAMA_CHAT_MODEL = 'gemma2:9b';

    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    server = await listenOnLoopback(app);
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('dev-provider-tester');
    agent = supertest.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'dev-provider-tester',
        password: 'a-real-password-123',
        gitName: 'Dev Provider Tester',
        gitEmail: 'dev-provider-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(`devProvider.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
    }
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    server.close();
    await fakeOllama.close();
    for (const name of ['AGENTIC_REPO_ROOT', 'LLM_PROVIDER', 'DEV_TOOLS_ENABLED', 'ASK_STATIC_ANSWERS_FILE',
        'OLLAMA_BASE_URL', 'OLLAMA_EMBED_MODEL', 'OLLAMA_CHAT_MODEL']) {
        delete process.env[name];
    }
    await destroyTestRepo(testRepoPath);
});

beforeEach(() => fakeOllama.reset());

async function currentProvider() {
    return (await agent.get('/api/dev/provider')).body.provider;
}

describe('without a session', () => {
    it('rejects GET and POST with 401', async () => {
        expect((await supertest(server).get('/api/dev/provider')).status).toBe(401);
        const res = await supertest(server).post('/api/dev/provider').send({ provider: 'static' });
        expect(res.status).toBe(401);
        expect(await currentProvider()).toBeNull();
    });
});

describe('with LLM_PROVIDER unset', () => {
    it('reports no provider, and Ask is off', async () => {
        expect(await agent.get('/api/dev/provider').then((res) => res.body)).toEqual({ provider: null });
        expect((await agent.get('/api/ask/config')).body).toMatchObject({ enabled: false, mode: null });
        expect((await agent.post('/api/ask').send({ question: 'anything' })).status).toBe(503);
    });
});

describe('POST /api/dev/provider input', () => {
    it.each([
        [{}],
        [{ provider: 'Static' }],
        [{ provider: 'OLLAMA' }],
        [{ provider: ' static' }],
        [{ provider: 'off' }],
        [{ provider: '' }],
        [{ provider: null }],
        [{ provider: ['static'] }],
        [{ provider: { name: 'static' } }],
        [['static']],
    ])('rejects %j with 400 and changes nothing', async (body) => {
        const res = await agent.post('/api/dev/provider').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'provider must be "static" or "ollama"' });
        expect(await currentProvider()).toBeNull();
    });

    it('rejects a request with no body with 400', async () => {
        const res = await agent.post('/api/dev/provider');
        expect(res.status).toBe(400);
        expect(await currentProvider()).toBeNull();
    });

    // What a cross-site form can send without a CORS preflight. Only
    // application/json is parsed, so the body never reaches the check.
    it.each([
        ['text/plain', '{"provider":"static"}'],
        ['text/plain', 'provider=static'],
        ['application/x-www-form-urlencoded', 'provider=static'],
    ])('rejects a %s body (%j) with 400 and changes nothing', async (type, body) => {
        const res = await agent.post('/api/dev/provider').set('Content-Type', type).send(body);
        expect(res.status).toBe(400);
        expect(await currentProvider()).toBeNull();
    });
});

describe('switching to static', () => {
    it('turns Ask on from unset, and config and POST /api/ask follow without a restart', async () => {
        const res = await agent.post('/api/dev/provider').send({ provider: 'static' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ provider: 'static' });
        expect(await currentProvider()).toBe('static');

        const config = (await agent.get('/api/ask/config')).body;
        expect(config).toMatchObject({ enabled: true, mode: 'static', capture: { model: 'gemma2:9b' } });
        expect(config.questions.map((q) => q.id)).toEqual(['all-scribe-draft-trust', 'onboarding-calendar-step']);

        const answer = await agent.post('/api/ask').send({ questionId: 'onboarding-calendar-step' });
        expect(answer.status).toBe(200);
        expect(answer.body.answer).toBe('The records don\'t say.');
        expect((await agent.post('/api/ask').send({ question: 'typed' })).status).toBe(400);
        expect(fakeOllama.state.requests).toHaveLength(0);
    });
});

describe('switching to ollama', () => {
    it('fails with 502 when Ollama is not reachable, and stays on static', async () => {
        fakeOllama.state.dropNext = true;
        const res = await agent.post('/api/dev/provider').send({ provider: 'ollama' });
        expect(res.status).toBe(502);
        expect(res.body.error).toBe(`Ollama isn't reachable at ${fakeOllama.url}`);
        expect(await currentProvider()).toBe('static');
        expect((await agent.get('/api/ask/config')).body.mode).toBe('static');
    });

    it('fails with 502 when Ollama answers an error, and stays on static', async () => {
        fakeOllama.state.failNext = 500;
        const res = await agent.post('/api/dev/provider').send({ provider: 'ollama' });
        expect(res.status).toBe(502);
        expect(res.body.error).toBe(`Ollama at ${fakeOllama.url} answered 500`);
        expect(await currentProvider()).toBe('static');
    });

    it('fails with 502 naming the model that is not pulled, and stays on static', async () => {
        const pulled = fakeOllama.state.models;
        fakeOllama.state.models = ['nomic-embed-text:latest'];
        try {
            const res = await agent.post('/api/dev/provider').send({ provider: 'ollama' });
            expect(res.status).toBe(502);
            expect(res.body.error).toBe(`Ollama at ${fakeOllama.url} doesn't have gemma2:9b (run: ollama pull gemma2:9b)`);
            expect(await currentProvider()).toBe('static');
        } finally {
            fakeOllama.state.models = pulled;
        }
    });

    it('switches when Ollama is up with both models, asking it for nothing but its model list', async () => {
        const res = await agent.post('/api/dev/provider').send({ provider: 'ollama' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ provider: 'ollama' });
        expect(fakeOllama.state.requests.map((r) => r.path)).toEqual(['/api/tags']);

        const config = (await agent.get('/api/ask/config')).body;
        expect(config).toMatchObject({ enabled: true, mode: 'live' });
        expect(config.questions).toBeUndefined();
        expect(config.capture).toBeUndefined();

        const answer = await agent.post('/api/ask').send({ question: 'Why did admins stall on the calendar step?' });
        expect(answer.status).toBe(200);
        expect(answer.body.answer).toBe(FAKE_ANSWER);
        expect((await agent.post('/api/ask').send({ questionId: 'onboarding-calendar-step' })).status).toBe(400);
    });

    it('switching again to the provider already active is a harmless 200', async () => {
        const res = await agent.post('/api/dev/provider').send({ provider: 'ollama' });
        expect(res.status).toBe(200);
        expect(await currentProvider()).toBe('ollama');
    });
});

describe('a switch while a question is being answered', () => {
    it('lets the question finish with the provider it started on', async () => {
        fakeOllama.state.chatDelayMs = 400;
        try {
            const pending = agent.post('/api/ask').send({ question: 'Why did admins stall on the calendar step?' }).then((res) => res);
            // Wait until the question has reached the model.
            while (fakeOllama.requestsTo('/api/chat').length === 0) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            const switched = await agent.post('/api/dev/provider').send({ provider: 'static' });
            expect(switched.status).toBe(200);

            const res = await pending;
            expect(res.status).toBe(200);
            expect(res.body.answer).toBe(FAKE_ANSWER);
            expect((await agent.get('/api/ask/config')).body.mode).toBe('static');
        } finally {
            fakeOllama.state.chatDelayMs = 0;
        }
    });

    it('keeps the embeddings across switches: back on ollama, only the question is embedded', async () => {
        expect((await agent.post('/api/dev/provider').send({ provider: 'ollama' })).status).toBe(200);
        fakeOllama.reset();

        expect((await agent.post('/api/ask').send({ question: 'Why did admins stall?' })).status).toBe(200);
        const embeds = fakeOllama.requestsTo('/api/embed');
        expect(embeds).toHaveLength(1);
        expect(embeds[0].body.input).toEqual(['search_query: Why did admins stall?']);
    });
});

// On their own: a fresh copy of the provider state per case, behind a bare
// app with a signed-in session stub, so the shared server above is untouched.
describe('in isolation', () => {
    const saved = { ...process.env };
    afterEach(() => { process.env = { ...saved }; });

    function isolatedApp() {
        let router, activeProvider;
        jest.isolateModules(() => {
            activeProvider = require('../ask/activeProvider');
            router = require('../routes/dev');
        });
        const bare = express();
        bare.use(express.json());
        bare.use((req, res, next) => { req.session = { userId: 1 }; next(); });
        bare.use('/api/dev', router);
        return { app: bare, activeProvider };
    }

    it('fails with 500 when the static answers file is invalid, and stays as it was', async () => {
        process.env.LLM_PROVIDER = '';
        process.env.ASK_STATIC_ANSWERS_FILE = path.join(__dirname, 'fixtures', 'static-answers', 'missing.json');
        const { app: bare, activeProvider } = isolatedApp();

        const res = await supertest(bare).post('/api/dev/provider').send({ provider: 'static' });
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/needs a valid answers file/);
        expect(activeProvider.get()).toBeNull();
    });

    it('starts from LLM_PROVIDER again after a restart', () => {
        process.env.LLM_PROVIDER = 'ollama';
        const first = isolatedApp().activeProvider;
        first.set('static');
        expect(first.get()).toBe('static');

        expect(isolatedApp().activeProvider.get()).toBe('ollama');
    });
});
