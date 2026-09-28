const fs = require('fs/promises');
const path = require('path');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const { startFakeOllama } = require('./helpers/fakeOllama');

// Ask the Repo against a corpus with project tagging on (research/projects.yml;
// see tests/fixtures/projects-corpus/README.md): GET /api/ask/config's project
// list and each source's recordProject. Every record in this corpus is in
// project-onboarding.

const CORPUS_DIR = path.join(__dirname, 'fixtures', 'projects-corpus');

let testRepoPath;
let fakeOllama;
let app, sessionDb, clearSessionInterval, db, server, request, agent;

beforeAll(async () => {
    fakeOllama = await startFakeOllama({ chatReply: () => 'Admins stalled on the invite step [1].' });
    testRepoPath = createTestRepo({ corpusDir: CORPUS_DIR });
    process.env.AGENTIC_REPO_ROOT = testRepoPath;
    process.env.LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = fakeOllama.url;
    process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text';
    process.env.OLLAMA_CHAT_MODEL = 'gemma2:9b';

    // Required after the env vars above: routes read them at module load.
    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    server = app.listen(0);
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('ask-projects-tester');
    agent = request.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'ask-projects-tester',
        password: 'a-real-password-123',
        gitName: 'Ask Projects Tester',
        gitEmail: 'ask-projects-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(`ask.projects.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
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
    delete process.env.OLLAMA_BASE_URL;
    await destroyTestRepo(testRepoPath);
});

beforeEach(() => {
    fakeOllama.reset();
});

describe('GET /api/ask/config', () => {
    it('lists projects.yml\'s projects with labels and record counts', async () => {
        const res = await agent.get('/api/ask/config');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            enabled: true,
            mode: 'live',
            projects: [
                { id: 'project-onboarding', label: 'Onboarding', count: 4 },
                { id: 'project-cross-cutting', label: 'Cross-cutting', count: 0 },
            ],
        });

        // The count is the same records GET /api/records returns with the tag.
        const records = (await agent.get('/api/records?summary=true')).body;
        expect(records.filter((r) => r.tags.includes('project-onboarding'))).toHaveLength(4);

        // Nothing is embedded or generated just to read the config.
        expect(fakeOllama.state.requests).toHaveLength(0);
    });

    it('keeps projects.yml\'s order but always puts project-cross-cutting last', async () => {
        const file = path.join(testRepoPath, 'research', 'projects.yml');
        const original = await fs.readFile(file, 'utf8');
        const reordered = original.replace(
            /(  - id: project-onboarding\n(?:    .*\n)+)(  - id: project-cross-cutting\n(?:    .*\n)+)/,
            '$2$1',
        );
        expect(reordered.indexOf('project-cross-cutting')).toBeLessThan(reordered.indexOf('id: project-onboarding'));
        await fs.writeFile(file, reordered);
        try {
            const res = await agent.get('/api/ask/config');
            expect(res.body.projects.map((p) => p.id)).toEqual(['project-onboarding', 'project-cross-cutting']);
        } finally {
            await fs.writeFile(file, original);
        }
    });
});

describe('POST /api/ask sources', () => {
    it('carry the record\'s own project tag as recordProject, separate from the request filter', async () => {
        const res = await agent.post('/api/ask').send({ question: 'Where did admins get stuck in onboarding?' });

        expect(res.status).toBe(200);
        expect(res.body.sources).toHaveLength(1);
        expect(res.body.sources[0]).toMatchObject({ project: null, recordProject: 'project-onboarding' });
    });

    it('echo the filter in project and the record\'s tag in recordProject when a project is picked', async () => {
        const res = await agent.post('/api/ask').send({
            question: 'Where did admins get stuck in onboarding?',
            project: 'project-onboarding',
        });

        expect(res.status).toBe(200);
        expect(res.body.sources[0]).toMatchObject({
            project: 'project-onboarding',
            recordProject: 'project-onboarding',
        });
    });
});
