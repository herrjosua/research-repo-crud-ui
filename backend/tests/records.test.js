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

describe('POST /api/sessions (raw mode)', () => {
    const validRawSession = {
        mode: 'raw',
        title: 'Onboarding flow usability test',
        type: 'usability-test',
        topicSlug: 'onboarding-flow-usability-test',
        date: '2026-01-15',
        tags: 'onboarding,usability',
        researcher: 'Records Tester',
    };

    it('creates a raw session and commits it to git', async () => {
        const res = await agent.post('/api/sessions').send(validRawSession);

        expect(res.status).toBe(201);
        expect(res.body.message).toMatch(/Created/);

        // Confirm it actually shows up via the real export_records.py round-trip,
        // not just that new_research_session.py claimed success.
        const listRes = await agent.get('/api/records?kind=raw');
        expect(listRes.status).toBe(200);
        expect(listRes.body).toHaveLength(1);
        expect(listRes.body[0]).toMatchObject({
            id: 'raw:2026-01-15-onboarding-flow-usability-test',
            kind: 'raw',
            title: 'Onboarding flow usability test',
        });
    });

    it('rejects a mode that is neither raw nor deliverable', async () => {
        const res = await agent.post('/api/sessions').send({ mode: 'bogus' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/mode must be/);
    });

    it('rejects raw mode missing required fields', async () => {
        const res = await agent.post('/api/sessions').send({ mode: 'raw', title: 'Missing stuff' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/requires title, type, and topicSlug/);
    });

    it('requires a logged-in session', async () => {
        // A plain (non-agent) request has no session cookie at all.
        const res = await request(app).post('/api/sessions').send(validRawSession);
        expect(res.status).toBe(401);
    });
});

const fs = require('fs/promises');
const path = require('path');

describe('GET /api/records/:id', () => {
    const recordId = 'raw:2026-01-15-onboarding-flow-usability-test';

    it('returns the full record including rawContent', async () => {
        const res = await agent.get(`/api/records/${recordId}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            id: recordId,
            kind: 'raw',
            title: 'Onboarding flow usability test',
            status: 'raw',
        });
        expect(res.body.rawContent).toMatch(/## Objective/);
    });

    it('returns 404 for an id that does not exist', async () => {
        const res = await agent.get('/api/records/raw:does-not-exist');
        expect(res.status).toBe(404);
    });

    it('requires a logged-in session', async () => {
        const res = await request(app).get(`/api/records/${recordId}`);
        expect(res.status).toBe(401);
    });
});

describe('PUT /api/records/:id', () => {
    const recordId = 'raw:2026-01-15-onboarding-flow-usability-test';
    const filePath = () =>
        path.join(testRepoPath, 'research', 'raw', '2026-01-15-onboarding-flow-usability-test', 'session-notes.md');

    it('updates a frontmatter field without disturbing unrelated fields, and keeps date a plain string', async () => {
        const res = await agent.put(`/api/records/${recordId}`).send({
            frontmatter: { status: 'in-review' },
        });
        expect(res.status).toBe(200);

        const fetchRes = await agent.get(`/api/records/${recordId}`);
        expect(fetchRes.body.status).toBe('in-review');
        // This is the v1.0 gray-matter fix under test: an edit that never touches
        // `date` should not silently upgrade it from a plain "2026-01-15" string
        // into a full ISO timestamp.
        expect(fetchRes.body.date).toBe('2026-01-15');
    });

    it('writes last_edited_by and last_edited_at to the actual file', async () => {
        await agent.put(`/api/records/${recordId}`).send({ frontmatter: { status: 'final' } });

        const fileText = await fs.readFile(filePath(), 'utf8');
        expect(fileText).toMatch(/last_edited_by: Records Tester/);
        expect(fileText).toMatch(/last_edited_at:/);
    });

    it('replaces the body content when content is provided', async () => {
        const res = await agent.put(`/api/records/${recordId}`).send({
            content: '# Updated\n\nThis body was replaced by a test.',
        });
        expect(res.status).toBe(200);

        const fetchRes = await agent.get(`/api/records/${recordId}`);
        expect(fetchRes.body.rawContent).toBe('# Updated\n\nThis body was replaced by a test.');
    });

    it('rejects a body with neither frontmatter nor content', async () => {
        const res = await agent.put(`/api/records/${recordId}`).send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/frontmatter and\/or content/);
    });

    it('returns 404 for an id that does not exist', async () => {
        const res = await agent.put('/api/records/raw:does-not-exist').send({ frontmatter: { status: 'final' } });
        expect(res.status).toBe(404);
    });

    it('requires a logged-in session', async () => {
        const res = await request(app).put(`/api/records/${recordId}`).send({ frontmatter: { status: 'final' } });
        expect(res.status).toBe(401);
    });
});