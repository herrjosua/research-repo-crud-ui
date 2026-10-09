const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const matter = require('gray-matter');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const { listenOnLoopback } = require('./helpers/loopbackServer');

// Project tagging (agentic-repo's docs/projects.md) is only on in a checkout
// with research/projects.yml, so this file runs against its own corpus that
// has one. See tests/fixtures/projects-corpus/README.md.
const CORPUS_DIR = path.join(__dirname, 'fixtures', 'projects-corpus');
const RAW_ID = 'raw:2026-01-19-onboarding-usability-test';
const RAW_FOLDER = '2026-01-19-onboarding-usability-test';

let testRepoPath;
let app, sessionDb, clearSessionInterval;
let request, db, agent, server;

const repoFile = (...parts) => path.join(testRepoPath, ...parts);
const git = (...args) => execFileSync('git', args, { cwd: testRepoPath }).toString();
const readTags = async (...parts) => matter(await fs.readFile(repoFile(...parts), 'utf8')).data.tags;
const projectsYml = () => fs.readFile(repoFile('research', 'projects.yml'), 'utf8');

beforeAll(async () => {
    testRepoPath = createTestRepo({ corpusDir: CORPUS_DIR });
    process.env.AGENTIC_REPO_ROOT = testRepoPath;

    // Required after AGENTIC_REPO_ROOT is set; see records.test.js.
    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    server = await listenOnLoopback(app);
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('project-tags-tester');
    agent = request.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'project-tags-tester',
        password: 'a-real-password-123',
        gitName: 'Records Tester',
        gitEmail: 'project-tags-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(`projectTags.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
    }
});

beforeEach(() => {
    require('../middleware/rateLimiter')._resetForTests();
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    server.close();
    delete process.env.AGENTIC_REPO_ROOT;
    await destroyTestRepo(testRepoPath);
});

describe('fixture sanity check', () => {
    it('every record exports with exactly one project tag', async () => {
        const res = await agent.get('/api/records');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(4);
        for (const record of res.body) {
            expect(record.tags.filter((t) => t.startsWith('project-'))).toEqual(['project-onboarding']);
        }
    });
});

describe('PUT a raw session', () => {
    it('never writes a project-* tag into raw/, whatever the client sends', async () => {
        const res = await agent.put(`/api/records/${RAW_ID}`).send({
            frontmatter: { tags: ['onboarding', 'project-onboarding', 'usability', 'project-cross-cutting'] },
        });

        expect(res.status).toBe(200);
        expect(res.body.warning).toBeUndefined();
        expect(await readTags('research', 'raw', RAW_FOLDER, 'session-notes.md')).toEqual(['onboarding', 'usability']);

        // Its project still comes from projects.yml.
        const record = await agent.get(`/api/records/${RAW_ID}`);
        expect(record.body.tags).toEqual(['onboarding', 'usability', 'project-onboarding']);
    });

    it('re-saving the tags exactly as GET returned them writes no project tag', async () => {
        const before = await agent.get(`/api/records/${RAW_ID}`);
        const res = await agent.put(`/api/records/${RAW_ID}`).send({ frontmatter: { tags: before.body.tags } });

        expect(res.status).toBe(200);
        const tags = await readTags('research', 'raw', RAW_FOLDER, 'session-notes.md');
        expect(tags.some((t) => t.startsWith('project-'))).toBe(false);
    });
});

describe('PUT a finding, analytics summary or deliverable', () => {
    const cases = [
        ['finding', 'finding:onboarding', ['research', 'findings', 'onboarding.md']],
        ['analytics summary', 'analytics:onboarding-funnel', ['analytics', 'summaries', 'onboarding-funnel.md']],
        ['deliverable', 'deliverable:personas/onboarding-admin', ['personas', 'onboarding-admin.md']],
    ];

    describe.each(cases)('%s', (_label, id, file) => {
        it('keeps its project tag when the client removes it', async () => {
            const res = await agent.put(`/api/records/${id}`).send({ frontmatter: { tags: ['onboarding', 'renamed'] } });

            expect(res.status).toBe(200);
            expect(await readTags(...file)).toEqual(['onboarding', 'renamed', 'project-onboarding']);
        });

        it('keeps its project tag when the client changes it', async () => {
            const res = await agent.put(`/api/records/${id}`).send({ frontmatter: { tags: ['onboarding', 'project-cross-cutting'] } });

            expect(res.status).toBe(200);
            expect(await readTags(...file)).toEqual(['onboarding', 'project-onboarding']);
        });

        it('keeps exactly one project tag when the client adds another', async () => {
            const res = await agent.put(`/api/records/${id}`).send({
                frontmatter: { tags: ['onboarding', 'project-onboarding', 'project-cross-cutting'] },
            });

            expect(res.status).toBe(200);
            expect(await readTags(...file)).toEqual(['onboarding', 'project-onboarding']);
        });

        it('keeps its project tag when the client sends tags: null', async () => {
            const res = await agent.put(`/api/records/${id}`).send({ frontmatter: { tags: null } });

            expect(res.status).toBe(200);
            expect(await readTags(...file)).toEqual(['project-onboarding']);
        });

        it('leaves tags alone when the edit doesn\'t send them, and build_index.py stays clean', async () => {
            await agent.put(`/api/records/${id}`).send({ frontmatter: { tags: ['onboarding'] } });
            const res = await agent.put(`/api/records/${id}`).send({ frontmatter: { title: 'Retitled' } });

            expect(res.status).toBe(200);
            expect(res.body.warning).toBeUndefined();
            expect(await readTags(...file)).toEqual(['onboarding', 'project-onboarding']);
        });
    });

    it('doesn\'t give a project tag to a record that has none', async () => {
        const file = ['research', 'findings', 'untagged.md'];
        await fs.writeFile(
            repoFile(...file),
            '---\ntitle: Untagged\ndate: 2026-02-02\ntype: synthesis\nstatus: synthesized\ntags:\n  - onboarding\n---\n\nBody\n',
        );

        const res = await agent.put('/api/records/finding:untagged').send({
            frontmatter: { tags: ['onboarding', 'project-onboarding'] },
        });

        expect(res.status).toBe(200);
        expect(await readTags(...file)).toEqual(['onboarding']);

        // Clean up, so later tests start from a corpus build_index.py accepts.
        expect((await agent.delete('/api/records/finding:untagged')).status).toBe(204);
    });
});

describe('POST /api/sessions (raw) with projects.yml', () => {
    const folder = '2026-03-01-projects-create-test';

    it('commits the new projects.yml entry with the session, and writes no project tag', async () => {
        const res = await agent.post('/api/sessions').send({
            mode: 'raw',
            title: 'Projects create test',
            type: 'interview',
            topicSlug: 'projects-create-test',
            date: '2026-03-01',
            tags: 'onboarding,project-onboarding',
        });
        expect(res.status).toBe(201);

        expect(await projectsYml()).toContain(`  ${folder}: project-cross-cutting\n`);
        expect(git('show', '--name-only', '--format=', 'HEAD').split('\n')).toEqual(expect.arrayContaining([
            'research/projects.yml',
            `research/raw/${folder}/session-notes.md`,
        ]));
        expect(git('status', '--porcelain', '--', 'research/projects.yml')).toBe('');

        expect(await readTags('research', 'raw', folder, 'session-notes.md')).toEqual(['onboarding']);
    });

    it('leaves projects.yml out of the commit when it already had uncommitted edits', async () => {
        const handEdited = `${await projectsYml()}# a hand edit\n`;
        await fs.writeFile(repoFile('research', 'projects.yml'), handEdited);

        const res = await agent.post('/api/sessions').send({
            mode: 'raw', title: 'Dirty create', type: 'interview', topicSlug: 'dirty-create', date: '2026-03-02',
        });
        expect(res.status).toBe(201);

        expect(git('show', '--name-only', '--format=', 'HEAD')).not.toContain('research/projects.yml');
        expect(await projectsYml()).toContain('# a hand edit');
        expect(git('status', '--porcelain', '--', 'research/projects.yml')).not.toBe('');

        git('checkout', '--', 'research/projects.yml');
        expect((await agent.delete('/api/records/raw:2026-03-02-dirty-create')).status).toBe(204);
    });
});

describe('DELETE a raw session with projects.yml', () => {
    const create = (slug, date) => agent.post('/api/sessions').send({
        mode: 'raw', title: `Delete ${slug}`, type: 'interview', topicSlug: slug, date,
    });

    it('removes its projects.yml entry in the same commit, keeping comments and formatting', async () => {
        expect((await create('delete-projects-test', '2026-04-01')).status).toBe(201);
        const before = await projectsYml();
        expect(before).toContain('2026-04-01-delete-projects-test: project-cross-cutting');

        const res = await agent.delete('/api/records/raw:2026-04-01-delete-projects-test');

        // 204 means build_index.py ran clean: no stale entry.
        expect(res.status).toBe(204);
        const after = await projectsYml();
        expect(after).toBe(before.replace('  2026-04-01-delete-projects-test: project-cross-cutting\n', ''));
        expect(after).toContain(`${RAW_FOLDER}: project-onboarding  # keep this comment`);
        expect(git('show', '--name-only', '--format=', 'HEAD')).toContain('research/projects.yml');
        expect(git('status', '--porcelain')).toBe('');
    });

    it('still deletes, with a logged warning, when the entry can\'t be edited safely', async () => {
        expect((await create('delete-unsafe-test', '2026-04-02')).status).toBe(201);
        // A flow-style raw: map isn't something a one-line edit can handle.
        const original = await projectsYml();
        const flow = original.replace(/^raw:\n(?:[ \t]+.*\n)+/m, (block) => {
            const entries = block.split('\n').slice(1).filter(Boolean).map((l) => l.replace(/#.*/, '').trim());
            return `raw: {${entries.join(', ')}}\n`;
        });
        await fs.writeFile(repoFile('research', 'projects.yml'), flow);
        git('commit', '-qam', 'flow-style projects.yml');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await agent.delete('/api/records/raw:2026-04-02-delete-unsafe-test');

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('2026-04-02-delete-unsafe-test'));
        warn.mockRestore();
        // The delete succeeded and was committed; build_index.py reports the
        // stale entry it couldn't remove.
        expect(res.status).toBe(200);
        expect(res.body.warning).toMatch(/2026-04-02-delete-unsafe-test/);
        expect(fsSync.existsSync(repoFile('research', 'raw', '2026-04-02-delete-unsafe-test'))).toBe(false);
        expect(git('log', '-1', '--format=%s')).toMatch(/^Delete raw\/2026-04-02-delete-unsafe-test/);
        expect(await projectsYml()).toBe(flow);

        await fs.writeFile(
            repoFile('research', 'projects.yml'),
            original.replace('  2026-04-02-delete-unsafe-test: project-cross-cutting\n', ''),
        );
        git('commit', '-qam', 'restore block-style projects.yml');
    });

    it('removes the entry but leaves projects.yml uncommitted when it already had uncommitted edits', async () => {
        expect((await create('delete-dirty-test', '2026-04-03')).status).toBe(201);
        await fs.appendFile(repoFile('research', 'projects.yml'), '# a hand edit\n');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await agent.delete('/api/records/raw:2026-04-03-delete-dirty-test');

        warn.mockRestore();
        expect(res.status).toBe(204);
        const after = await projectsYml();
        expect(after).not.toContain('2026-04-03-delete-dirty-test');
        expect(after).toContain('# a hand edit');
        expect(git('show', '--name-only', '--format=', 'HEAD')).not.toContain('research/projects.yml');

        git('commit', '-qam', 'hand edit');
    });
});

describe('projects.js helpers', () => {
    const { projectSafeTags, removeRawSessionEntry } = require('../projects');

    it('projectSafeTags leaves components and unknown kinds alone', () => {
        expect(projectSafeTags('component', ['a', 'project-x'], [])).toEqual(['a', 'project-x']);
    });

    it('projectSafeTags keeps tags: null on a record with no project tag', () => {
        expect(projectSafeTags('finding', null, ['a'])).toBeNull();
        expect(projectSafeTags('raw', null, ['a'])).toBeNull();
    });

    it('removeRawSessionEntry is a no-op without projects.yml or without the entry', () => {
        const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'projects-helper-'));
        try {
            expect(removeRawSessionEntry(dir, '2026-01-01-x')).toBe('absent');
            fsSync.mkdirSync(path.join(dir, 'research'));
            const text = 'projects:\n  - id: project-cross-cutting\nraw:\n  2026-01-02-y: project-cross-cutting\n';
            fsSync.writeFileSync(path.join(dir, 'research', 'projects.yml'), text);
            expect(removeRawSessionEntry(dir, '2026-01-01-x')).toBe('absent');
            expect(fsSync.readFileSync(path.join(dir, 'research', 'projects.yml'), 'utf8')).toBe(text);
        } finally {
            fsSync.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('removeRawSessionEntry handles quoted keys and an entry that ends the file without a newline', () => {
        const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'projects-helper-'));
        try {
            fsSync.mkdirSync(path.join(dir, 'research'));
            const file = path.join(dir, 'research', 'projects.yml');
            fsSync.writeFileSync(file, 'raw:\n  keep-me: project-a\n  "2026-01-01-x": project-b');
            expect(removeRawSessionEntry(dir, '2026-01-01-x')).toBe('removed');
            expect(fsSync.readFileSync(file, 'utf8')).toBe('raw:\n  keep-me: project-a\n');
        } finally {
            fsSync.rmSync(dir, { recursive: true, force: true });
        }
    });
});
