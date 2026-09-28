const fs = require('fs');
const path = require('path');
const { ANSWERS_FILE } = require('../ask/staticAnswers');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const { startFakeOllama } = require('./helpers/fakeOllama');

// Ask the Repo with LLM_PROVIDER=static: the public demo's captured answers,
// served from a fixture answers file (tests/fixtures/static-answers/). A fake
// Ollama is running and OLLAMA_BASE_URL points at it, so any request that
// reached a model would show up in its log. Its own file because
// routes/ask.js reads LLM_PROVIDER once, at load time.

const CORPUS_DIR = path.join(__dirname, 'fixtures', 'projects-corpus');
const ANSWERS_FIXTURE = path.join(__dirname, 'fixtures', 'static-answers', 'answers.json');
const fixture = require(ANSWERS_FIXTURE);

let testRepoPath;
let fakeOllama;
let app, sessionDb, clearSessionInterval, db, server, request, agent;

beforeAll(async () => {
    fakeOllama = await startFakeOllama({ chatReply: () => 'This should never be asked [1].' });
    testRepoPath = createTestRepo({ corpusDir: CORPUS_DIR });
    process.env.AGENTIC_REPO_ROOT = testRepoPath;
    process.env.LLM_PROVIDER = 'static';
    process.env.ASK_STATIC_ANSWERS_FILE = ANSWERS_FIXTURE;
    process.env.OLLAMA_BASE_URL = fakeOllama.url;

    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    server = app.listen(0);
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('ask-static-tester');
    agent = request.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'ask-static-tester',
        password: 'a-real-password-123',
        gitName: 'Ask Static Tester',
        gitEmail: 'ask-static-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(`ask.static.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
    }
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    server.close();
    await fakeOllama.close();
    delete process.env.AGENTIC_REPO_ROOT;
    delete process.env.LLM_PROVIDER;
    delete process.env.ASK_STATIC_ANSWERS_FILE;
    delete process.env.OLLAMA_BASE_URL;
    await destroyTestRepo(testRepoPath);
});

afterEach(() => {
    // Nothing in static mode may reach a model.
    expect(fakeOllama.state.requests).toHaveLength(0);
});

describe('GET /api/ask/config (static)', () => {
    it('rejects a request without a session', async () => {
        const res = await request(server).get('/api/ask/config');
        expect(res.status).toBe(401);
    });

    it('is enabled in static mode and lists the captured questions and the capture, keeping the project list', async () => {
        const res = await agent.get('/api/ask/config');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            enabled: true,
            mode: 'static',
            projects: [
                { id: 'project-onboarding', label: 'Onboarding', count: 4 },
                { id: 'project-cross-cutting', label: 'Cross-cutting', count: 0 },
            ],
            questions: [
                {
                    id: 'all-scribe-draft-trust',
                    question: "Why didn't physicians trust the ambient scribe's draft notes?",
                    project: null,
                },
                {
                    id: 'onboarding-calendar-step',
                    question: 'Why did new admins hesitate at the Connect calendar step?',
                    project: 'project-onboarding',
                },
            ],
            capture: { model: 'gemma2:9b', capturedAt: '2026-09-28T12:00:00.000Z' },
        });
    });
});

describe('POST /api/ask (static)', () => {
    it('rejects a request without a session', async () => {
        const res = await request(server).post('/api/ask').send({ questionId: 'all-scribe-draft-trust' });
        expect(res.status).toBe(401);
    });

    it('returns the captured answer by id, in the live response shape', async () => {
        const res = await agent.post('/api/ask').send({ questionId: 'all-scribe-draft-trust' });

        expect(res.status).toBe(200);
        const entry = fixture.questions[0];
        expect(res.body).toEqual({ answer: entry.answer, sources: entry.sources, model: 'gemma2:9b' });
        expect(Object.keys(res.body.sources[0]).sort()).toEqual([
            'contextAfter', 'contextBefore', 'date', 'excerpt', 'id', 'kind', 'project', 'recordId',
            'recordKind', 'recordProject', 'recordType', 'score', 'section', 'title',
        ]);
    });

    it('returns a captured answer with no sources as-is', async () => {
        const res = await agent.post('/api/ask').send({ questionId: 'onboarding-calendar-step' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ answer: 'The records don\'t say.', sources: [], model: 'gemma2:9b' });
    });

    it('ignores a project filter: each captured question has its own', async () => {
        const res = await agent.post('/api/ask').send({ questionId: 'all-scribe-draft-trust', project: 'project-onboarding' });

        expect(res.status).toBe(200);
        expect(res.body.answer).toBe(fixture.questions[0].answer);
    });

    it.each([
        [{ question: "Why didn't physicians trust the ambient scribe's draft notes?" }],
        [{ question: 'anything at all', project: 'project-onboarding' }],
        [{ question: 'free text wins nothing', questionId: 'all-scribe-draft-trust' }],
        [{ question: '' }],
    ])('rejects a free-text question %j with 400', async (body) => {
        const res = await agent.post('/api/ask').send(body);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/send questionId, not question/);
    });

    it.each([
        [{}],
        [{ questionId: '' }],
        [{ questionId: 42 }],
        [{ questionId: ['all-scribe-draft-trust'] }],
    ])('rejects a missing or malformed questionId %j with 400', async (body) => {
        const res = await agent.post('/api/ask').send(body);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'questionId is required' });
    });

    it.each(['no-such-question', 'toString', '__proto__', '../answers'])('answers 404 for unknown id %j', async (questionId) => {
        const res = await agent.post('/api/ask').send({ questionId });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'unknown questionId' });
    });
});

describe('routes/ask.js startup', () => {
    let saved;
    beforeEach(() => {
        saved = { ...process.env };
    });
    afterEach(() => {
        process.env = { ...saved };
    });

    function loadAskRoute() {
        let router;
        jest.isolateModules(() => {
            router = require('../routes/ask');
        });
        return router;
    }

    it.each(['static', 'Static', ' static ', 'ollama'])('accepts LLM_PROVIDER=%j', (value) => {
        process.env.LLM_PROVIDER = value;
        expect(loadAskRoute).not.toThrow();
    });

    it.each(['bedrock', 'openai', 'static-demo'])('refuses to start with LLM_PROVIDER=%j', (value) => {
        process.env.LLM_PROVIDER = value;
        expect(loadAskRoute).toThrow(/LLM_PROVIDER=.* is not supported/);
    });

    it('refuses to start in static mode without a valid answers file', () => {
        process.env.LLM_PROVIDER = 'static';
        process.env.ASK_STATIC_ANSWERS_FILE = path.join(__dirname, 'fixtures', 'static-answers', 'missing.json');
        expect(loadAskRoute).toThrow(/needs a valid answers file/);

        process.env.ASK_STATIC_ANSWERS_FILE = path.join(__dirname, 'fixtures', 'projects-corpus', 'research', 'projects.yml');
        expect(loadAskRoute).toThrow(/needs a valid answers file/);
    });

    // Reads of any answers file (the checked-in one or an override) while
    // the route loads.
    function answersFileReads(load) {
        const spy = jest.spyOn(fs, 'readFileSync');
        try {
            load();
            return spy.mock.calls
                .map(([file]) => String(file))
                .filter((file) => file === ANSWERS_FILE || file.endsWith('.json'));
        } finally {
            spy.mockRestore();
        }
    }

    it.each([['ollama'], ['']])('starts with LLM_PROVIDER=%j without reading or needing an answers file', (value) => {
        process.env.LLM_PROVIDER = value;
        // Even pointed at a file that doesn't exist, nothing is read.
        process.env.ASK_STATIC_ANSWERS_FILE = path.join(__dirname, 'fixtures', 'static-answers', 'missing.json');

        expect(answersFileReads(() => expect(loadAskRoute).not.toThrow())).toEqual([]);
    });

    it('ignores ASK_STATIC_ANSWERS_FILE outside NODE_ENV=test and reads the checked-in file', () => {
        process.env.LLM_PROVIDER = 'static';
        process.env.NODE_ENV = 'production';
        process.env.ASK_STATIC_ANSWERS_FILE = ANSWERS_FIXTURE;

        const reads = answersFileReads(() => {
            try {
                loadAskRoute();
            } catch {
                // Throws only if the checked-in file is missing or invalid,
                // which staticAnswers.data.test.js reports; here only which
                // file was read matters.
            }
        });
        expect(reads).toEqual([ANSWERS_FILE]);
    });
});
