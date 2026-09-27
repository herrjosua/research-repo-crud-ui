const path = require('path');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

// POST /api/ask end to end against a REAL local Ollama (nomic-embed-text +
// gemma2:9b) over E2E's fixed corpus. Skipped unless OLLAMA_LIVE=1, since CI
// has no Ollama and the model's wording isn't deterministic; run it locally
// with:
//
//   OLLAMA_LIVE=1 npx jest tests/ask.live.test.js
//
// Assertions stick to what a grounded answer must do regardless of wording.

const live = process.env.OLLAMA_LIVE === '1';
const CORPUS_DIR = path.join(__dirname, '..', '..', 'e2e', 'fixtures', 'corpus');

(live ? describe : describe.skip)('POST /api/ask against a real Ollama', () => {
    jest.setTimeout(300_000); // first call loads both models

    let testRepoPath;
    let app, sessionDb, clearSessionInterval, db, server, agent;

    beforeAll(async () => {
        testRepoPath = createTestRepo({ corpusDir: CORPUS_DIR });
        process.env.AGENTIC_REPO_ROOT = testRepoPath;
        process.env.LLM_PROVIDER = 'ollama';

        const request = require('supertest');
        ({ app, sessionDb, clearSessionInterval } = require('../app'));
        db = require('../db');
        server = app.listen(0);
        delete process.env.DEMO_MODE;

        db.prepare('DELETE FROM users WHERE username = ?').run('ask-live-tester');
        agent = request.agent(server);
        await agent.post('/api/auth/signup').send({
            username: 'ask-live-tester',
            password: 'a-real-password-123',
            gitName: 'Ask Live Tester',
            gitEmail: 'ask-live-tester@example.com',
        });
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

    it('answers a covered question with plain text and citations into real records', async () => {
        const res = await agent.post('/api/ask').send({
            question: 'How accurate was the ambient scribe prototype at capturing medication dosages?',
        });

        expect(res.status).toBe(200);
        expect(res.body.model).toBe(process.env.OLLAMA_CHAT_MODEL || 'gemma2:9b');
        expect(res.body.answer).toMatch(/\[1\]/);
        expect(res.body.answer).not.toMatch(/\*\*|<[a-z]|^#/im);
        expect(res.body.sources.length).toBeGreaterThan(0);
        expect(res.body.sources.some((s) => /Ambient AI Scribe/.test(s.title))).toBe(true);

        // Every [n] in the answer points at a returned source.
        const numbers = [...res.body.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
        expect(Math.max(...numbers)).toBe(res.body.sources.length);
    });

    it('declines an off-topic question without citing anything', async () => {
        const res = await agent.post('/api/ask').send({ question: 'What is the boiling point of water in Kelvin?' });

        expect(res.status).toBe(200);
        expect(res.body.sources).toEqual([]);
    });
});
