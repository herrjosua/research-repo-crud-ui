const { execFileSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const matter = require('gray-matter');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

// Commits made by the write routes must contain exactly the files the request
// touched, never unrelated working-tree changes (token sync output, hand
// edits, files someone already staged), and concurrent writes must not
// interleave. Own fixture repo, so `git status` is fully predictable here.

let testRepoPath;
let app, sessionDb, clearSessionInterval;
let request, db, agent, server;

const rawId = 'raw:2026-03-01-scope-raw';
const rawDir = 'research/raw/2026-03-01-scope-raw';
const planId = 'deliverable:research-plans/scope-plan';

const git = (...args) => execFileSync('git', args, { cwd: testRepoPath }).toString();

// Files in HEAD's commit, sorted, as "<status>\t<path>" (A/M/D).
function headFiles(rev = 'HEAD') {
    return git('show', '--name-status', '--format=', rev).trim().split('\n').sort();
}

// The three unrelated changes planted in beforeAll, exactly as they must
// still look after every request: modified-unstaged, staged, untracked.
const DIRTY_STATUS = [
    ' M notes.txt',
    '?? design-tokens/tokens.tokens.json',
    'M  staged.txt',
];

function workingTreeStatus() {
    return git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).sort();
}

beforeAll(async () => {
    testRepoPath = createTestRepo();
    process.env.AGENTIC_REPO_ROOT = testRepoPath;

    // Same load order and single-server setup as records.test.js's beforeAll.
    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    server = app.listen(0);
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('git-scope-tester');
    agent = request.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'git-scope-tester',
        password: 'a-real-password-123',
        gitName: 'Scope Tester',
        gitEmail: 'scope-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(`gitScope.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
    }

    // Plant unrelated changes of every kind.
    await fs.writeFile(path.join(testRepoPath, 'notes.txt'), 'notes\n');
    await fs.writeFile(path.join(testRepoPath, 'staged.txt'), 'staged\n');
    git('add', 'notes.txt', 'staged.txt');
    git('commit', '-m', 'Baseline unrelated files');
    await fs.writeFile(path.join(testRepoPath, 'notes.txt'), 'notes, edited by hand\n');
    await fs.writeFile(path.join(testRepoPath, 'staged.txt'), 'staged, by hand\n');
    git('add', 'staged.txt');
    await fs.mkdir(path.join(testRepoPath, 'design-tokens'));
    await fs.writeFile(path.join(testRepoPath, 'design-tokens', 'tokens.tokens.json'), '{}\n');
    expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    server.close();
    delete process.env.AGENTIC_REPO_ROOT;
    await destroyTestRepo(testRepoPath);
});

beforeEach(() => require('../middleware/rateLimiter')._resetForTests());

// Tests run in order and build on each other's records.
describe('write routes commit only the files they touched', () => {
    it('POST raw commits exactly the session folder, attributed to the user', async () => {
        const res = await agent.post('/api/sessions').send({
            mode: 'raw',
            title: 'Scope raw session',
            type: 'interview',
            topicSlug: 'scope-raw',
            date: '2026-03-01',
        });
        expect(res.status).toBe(201);

        expect(headFiles()).toEqual([
            `A\t${rawDir}/participants.md`,
            `A\t${rawDir}/session-notes.md`,
        ]);
        expect(git('log', '-1', '--format=%an <%ae>').trim()).toBe('Scope Tester <scope-tester@example.com>');
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });

    it('POST deliverable commits exactly the new file', async () => {
        const res = await agent.post('/api/sessions').send({
            mode: 'deliverable',
            folder: 'research-plans',
            title: 'Scope plan',
            slug: 'scope-plan',
            date: '2026-03-02',
        });
        expect(res.status).toBe(201);

        expect(headFiles()).toEqual(['A\tresearch-plans/scope-plan.md']);
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });

    it('PUT on a deliverable commits the record plus the indexes build_index.py created', async () => {
        const res = await agent.put(`/api/records/${planId}`).send({ content: '# Scope plan\n\nEdited.\n' });
        expect(res.status).toBe(200);

        expect(headFiles()).toEqual([
            'A\tresearch-plans/_index.md',
            'A\tresearch/_index.md',
            'M\tresearch-plans/scope-plan.md',
        ]);
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });

    it('PUT on a raw session commits exactly the record file', async () => {
        const res = await agent.put(`/api/records/${rawId}`).send({ content: '# Session\n\nEdited.\n' });
        expect(res.status).toBe(200);

        expect(headFiles()).toEqual([`M\t${rawDir}/session-notes.md`]);
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });

    it('DELETE of a raw session commits the removal of both files', async () => {
        const res = await agent.delete(`/api/records/${rawId}`);
        expect(res.status).toBe(204);

        // research/_index.md doesn't list raw sessions, so it doesn't change.
        expect(headFiles()).toEqual([
            `D\t${rawDir}/participants.md`,
            `D\t${rawDir}/session-notes.md`,
        ]);
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });
});

describe('repo lock', () => {
    const plan2Id = 'deliverable:research-plans/scope-plan-two';

    beforeAll(async () => {
        require('../middleware/rateLimiter')._resetForTests();
        const res = await agent.post('/api/sessions').send({
            mode: 'deliverable',
            folder: 'research-plans',
            title: 'Scope plan two',
            slug: 'scope-plan-two',
            date: '2026-03-03',
        });
        if (res.status !== 201) throw new Error(`setup failed: ${JSON.stringify(res.body)}`);
        // POST doesn't run build_index.py; refresh research-plans/_index.md
        // now so the concurrent test below only sees record-file changes.
        const put = await agent.put(`/api/records/${plan2Id}`).send({ content: '# Scope plan two\n' });
        if (put.status !== 200) throw new Error(`setup failed: ${JSON.stringify(put.body)}`);
    });

    it('two concurrent PUTs to different records each get their own commit', async () => {
        const before = git('rev-parse', 'HEAD').trim();
        const [a, b] = await Promise.all([
            agent.put(`/api/records/${planId}`).send({ content: '# Scope plan\n\nConcurrent A.\n' }),
            agent.put(`/api/records/${plan2Id}`).send({ content: '# Scope plan two\n\nConcurrent B.\n' }),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);

        expect(git('rev-parse', 'HEAD~2').trim()).toBe(before);
        const commits = [headFiles('HEAD~1'), headFiles('HEAD')].map((files) => files.join(',')).sort();
        expect(commits).toEqual([
            'M\tresearch-plans/scope-plan-two.md',
            'M\tresearch-plans/scope-plan.md',
        ]);
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });

    it('two concurrent PUTs to the same record changing different fields keep both changes', async () => {
        const [a, b] = await Promise.all([
            agent.put(`/api/records/${planId}`).send({ frontmatter: { scope: 'Onboarding flow' } }),
            agent.put(`/api/records/${planId}`).send({ frontmatter: { issues_found: 3 } }),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);

        const data = matter(await fs.readFile(path.join(testRepoPath, 'research-plans', 'scope-plan.md'), 'utf8')).data;
        expect(data).toMatchObject({ scope: 'Onboarding flow', issues_found: 3 });
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });

    it('a request that fails inside the lock releases it for the next one', async () => {
        // A stale index.lock makes git fail inside commitChange, so the PUT
        // throws while holding the repo lock.
        const indexLock = path.join(testRepoPath, '.git', 'index.lock');
        await fs.writeFile(indexLock, '');
        try {
            const failed = await agent.put(`/api/records/${plan2Id}`).send({ content: '# Scope plan two\n\nFails.\n' });
            expect(failed.status).toBe(500);
        } finally {
            await fs.rm(indexLock, { force: true });
        }

        const ok = await agent.put(`/api/records/${plan2Id}`).send({ content: '# Scope plan two\n\nRecovered.\n' });
        expect(ok.status).toBe(200);
        expect(headFiles()).toEqual(['M\tresearch-plans/scope-plan-two.md']);
        expect(workingTreeStatus()).toEqual(DIRTY_STATUS);
    });
});
