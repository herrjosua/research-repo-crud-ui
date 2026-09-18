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
    delete process.env.DEMO_MODE; // reset to the "off" baseline every test in this file assumes, regardless of what backend/.env currently has

    // Records routes require a logged-in session — sign up and log in once
    // here, reusing the same agent (persistent cookie jar) for every test
    // below, the same pattern the auth tests used for the login/me/logout flow.
    //
    // The per-worker test db file (app.test.<N>.db, see db.js) persists on
    // disk between separate `npm test` runs, unlike the fixture repo above
    // which is recreated fresh every time. Delete any leftover row from a
    // previous run first, so signup below always gets a clean 201 instead of
    // a silently-ignored 409 that would leave `agent` unauthenticated.
    db.prepare('DELETE FROM users WHERE username = ?').run('records-tester');

    agent = request.agent(app);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'records-tester',
        password: 'a-real-password-123',
        gitName: 'Records Tester',
        gitEmail: 'records-tester@example.com',
    });
    // Fail loudly here if signup ever breaks, instead of leaving `agent`
    // unauthenticated and letting every test below fail with a confusing 401.
    if (signupRes.status !== 201) {
        throw new Error(
            `records.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`,
        );
    }
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

    // The test above reads the file on disk because the API used to drop these two fields
    // (export_records.py's loaders never copied them into each record's JSON). These two
    // tests are the real regression check: the fields written by PUT must come back out of
    // both GET routes, with the right values.
    it('returns last_edited_by and last_edited_at from GET /api/records/:id after a PUT', async () => {
        const before = Date.now();
        const putRes = await agent.put(`/api/records/${recordId}`).send({ frontmatter: { status: 'final' } });
        expect(putRes.status).toBe(200);
        const after = Date.now();

        const res = await agent.get(`/api/records/${recordId}`);
        expect(res.status).toBe(200);
        expect(res.body.last_edited_by).toBe('Records Tester');

        // A real ISO timestamp from THIS edit, not merely "some string".
        expect(res.body.last_edited_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        const editedAtMs = new Date(res.body.last_edited_at).getTime();
        expect(editedAtMs).toBeGreaterThanOrEqual(before);
        expect(editedAtMs).toBeLessThanOrEqual(after);
    });

    it('returns last_edited_by and last_edited_at for the edited record in GET /api/records (list)', async () => {
        await agent.put(`/api/records/${recordId}`).send({ frontmatter: { status: 'final' } });

        const res = await agent.get('/api/records');
        expect(res.status).toBe(200);

        const record = res.body.find(r => r.id === recordId);
        expect(record).toBeDefined();
        expect(record.last_edited_by).toBe('Records Tester');
        expect(new Date(record.last_edited_at).toISOString()).toBe(record.last_edited_at);
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

describe('DELETE /api/records/:id', () => {
    const deleteRecordId = 'raw:2026-02-01-delete-me-test';
    const sessionFolder = () =>
        path.join(testRepoPath, 'research', 'raw', '2026-02-01-delete-me-test');

    beforeAll(async () => {
        await agent.post('/api/sessions').send({
            mode: 'raw',
            title: 'Session created only to be deleted',
            type: 'interview',
            topicSlug: 'delete-me-test',
            date: '2026-02-01',
        });
    });

    it('removes both session-notes.md and participants.md, not just one', async () => {
        // Confirm the folder genuinely has both files before deleting — this is
        // what makes the test meaningful, rather than just asserting the folder
        // is gone afterward.
        const beforeFiles = await fs.readdir(sessionFolder());
        expect(beforeFiles.sort()).toEqual(['participants.md', 'session-notes.md']);

        const res = await agent.delete(`/api/records/${deleteRecordId}`);
        expect(res.status).toBe(204);

        // The whole folder should be gone — this is the exact bug the v0.7
        // roadmap entry describes: an earlier version only removed
        // session-notes.md, silently orphaning participants.md.
        await expect(fs.readdir(sessionFolder())).rejects.toThrow();
    });

    it('is reflected in git history as a real commit', async () => {
        const { execFileSync } = require('child_process');
        const log = execFileSync('git', ['log', '--oneline'], { cwd: testRepoPath }).toString();
        expect(log).toMatch(/Delete raw\/2026-02-01-delete-me-test/);
    });

    it('returns 404 for an id that no longer exists (double delete)', async () => {
        const res = await agent.delete(`/api/records/${deleteRecordId}`);
        expect(res.status).toBe(404);
    });

    it('returns 404 for an id that never existed', async () => {
        const res = await agent.delete('/api/records/raw:never-existed');
        expect(res.status).toBe(404);
    });

    it('requires a logged-in session', async () => {
        const res = await request(app).delete(`/api/records/${deleteRecordId}`);
        expect(res.status).toBe(401);
    });
});

describe('GET /api/records/:id/history', () => {
    const historyRecordId = 'raw:2026-01-15-onboarding-flow-usability-test';

    it('returns commit history, newest first, with the expected shape', async () => {
        const res = await agent.get(`/api/records/${historyRecordId}/history`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // This record has been through: create (POST) + three PUTs from the
        // earlier test round = at least 4 commits touching it.
        expect(res.body.length).toBeGreaterThanOrEqual(4);

        for (const entry of res.body) {
            expect(entry).toMatchObject({
                hash: expect.any(String),
                authorName: 'Records Tester',
                authorEmail: 'records-tester@example.com',
                date: expect.any(String),
                message: expect.any(String),
            });
        }

        // git log's default order is newest-first — confirm the dates are
        // actually sorted that way, not just present.
        const dates = res.body.map(e => new Date(e.date).getTime());
        const sortedDescending = [...dates].sort((a, b) => b - a);
        expect(dates).toEqual(sortedDescending);
    });

    it('returns 404 for an id that does not exist', async () => {
        const res = await agent.get('/api/records/raw:does-not-exist/history');
        expect(res.status).toBe(404);
    });

    it('requires a logged-in session', async () => {
        const res = await request(app).get(`/api/records/${historyRecordId}/history`);
        expect(res.status).toBe(401);
    });
});

describe('GET /api/records/:id/history — --follow across delete + recreate', () => {
    const recreatedId = 'raw:2026-03-01-recreate-me-test';

    it('preserves full history when a record is deleted and a new one is created under the same slug', async () => {
        // Create, then immediately delete — this alone should produce 2 commits
        // (a create and a delete) for this exact id.
        await agent.post('/api/sessions').send({
            mode: 'raw',
            title: 'First incarnation',
            type: 'interview',
            topicSlug: 'recreate-me-test',
            date: '2026-03-01',
        });
        await agent.delete(`/api/records/${recreatedId}`);

        // Recreate under the exact same date + topicSlug, so it resolves to the
        // exact same id and file path as before.
        await agent.post('/api/sessions').send({
            mode: 'raw',
            title: 'Second incarnation',
            type: 'interview',
            topicSlug: 'recreate-me-test',
            date: '2026-03-01',
        });

        const res = await agent.get(`/api/records/${recreatedId}/history`);
        expect(res.status).toBe(200);
        // create -> delete -> create again = 3 commits total, all under the
        // same id. If --follow (or the AGENTIC_REPO_ROOT-relative path fix from
        // v0.8) weren't working, this would come back truncated or empty instead.
        expect(res.body.length).toBeGreaterThanOrEqual(3);
    });
});