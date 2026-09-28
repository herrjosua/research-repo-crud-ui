const path = require('path');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const { startFakeOllama } = require('./helpers/fakeOllama');

// Integration test for POST /api/ask: the real app, the real
// export_records.py over E2E's fixed corpus (real repo content), and a fake
// Ollama that speaks Ollama's actual HTTP/JSON API (see helpers/fakeOllama.js).
// tests/ask.live.test.js runs the same flow against a real local Ollama.

const CORPUS_DIR = path.join(__dirname, '..', '..', 'e2e', 'fixtures', 'corpus');

// What the fake model "says": markdown and HTML the server must flatten, and
// citations out of order plus one ([9]) pointing past the six sources given.
const MODEL_REPLY = [
    '## Summary',
    '',
    'Physicians **did not trust** the draft enough to skim it [2]. Medication dosages were',
    'garbled in 3 of 5 sessions [1][2], see [the notes](https://example.com/x).',
    '',
    '<script>alert("x")</script>* Edit affordance was hard to find [9]',
].join('\n');

let testRepoPath;
let fakeOllama;
let app, sessionDb, clearSessionInterval, db, server, request, agent;

beforeAll(async () => {
    fakeOllama = await startFakeOllama({ chatReply: () => MODEL_REPLY });
    testRepoPath = createTestRepo({ corpusDir: CORPUS_DIR });
    process.env.AGENTIC_REPO_ROOT = testRepoPath;
    process.env.LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = fakeOllama.url;
    // backend/.env may set these for local dev; pin the defaults under test.
    process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text';
    process.env.OLLAMA_CHAT_MODEL = 'gemma2:9b';

    // Required after the env vars above: routes read them at module load.
    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    server = app.listen(0);
    delete process.env.DEMO_MODE; // backend/.env may turn it on, which disables signup

    db.prepare('DELETE FROM users WHERE username = ?').run('ask-tester');
    agent = request.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'ask-tester',
        password: 'a-real-password-123',
        gitName: 'Ask Tester',
        gitEmail: 'ask-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(`ask.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
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

// The "[n] Title — Section (type, date)" header line of each source in the
// sources block the backend sent to the model, keyed by n. Titles can contain
// " — " themselves, so tests match a header by its title prefix.
function promptSourceHeaders(chatRequest) {
    const userContent = chatRequest.body.messages.find((m) => m.role === 'user').content;
    const headers = {};
    for (const match of userContent.matchAll(/^\[(\d+)\] (.+)$/gm)) {
        headers[match[1]] = match[2];
    }
    return headers;
}

describe('POST /api/ask', () => {
    it('rejects a request without a session', async () => {
        const res = await request(server).post('/api/ask').send({ question: 'anything' });
        expect(res.status).toBe(401);
    });

    it.each([
        [{}, /question is required/],
        [{ question: '   ' }, /question is required/],
        [{ question: 42 }, /question is required/],
        [{ question: 'x'.repeat(2001) }, /at most 2000/],
        [{ question: 'ok', project: '../etc' }, /project must be/],
        [{ question: 'ok', project: ['ambient-scribe'] }, /project must be/],
    ])('rejects invalid input %j', async (body, error) => {
        const res = await agent.post('/api/ask').send(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(error);
        expect(fakeOllama.state.requests).toHaveLength(0);
    });

    it('answers from retrieved passages with plain text and renumbered citations', async () => {
        const res = await agent.post('/api/ask').send({
            question: 'Did physicians trust the ambient scribe draft, and how accurate were medication dosages?',
        });

        expect(res.status).toBe(200);
        expect(res.body.model).toBe('gemma2:9b');

        // Plain text: no markdown or HTML survives, the link keeps its text,
        // the bullet is normalized, and the out-of-range [9] is dropped.
        expect(res.body.answer).toBe([
            'Summary',
            '',
            'Physicians did not trust the draft enough to skim it [1]. Medication dosages were',
            'garbled in 3 of 5 sessions [2][1], see the notes.',
            '',
            '- Edit affordance was hard to find',
        ].join('\n'));

        // What was sent to Ollama.
        const [chat] = fakeOllama.requestsTo('/api/chat');
        expect(chat.body).toMatchObject({ model: 'gemma2:9b', stream: false });
        expect(chat.body.messages[0].role).toBe('system');
        const embedInputs = fakeOllama.requestsTo('/api/embed').flatMap((r) => r.body.input);
        expect(embedInputs.at(-1)).toBe(
            'search_query: Did physicians trust the ambient scribe draft, and how accurate were medication dosages?',
        );
        expect(embedInputs.slice(0, -1).every((text) => text.startsWith('search_document: '))).toBe(true);

        // sources[] holds exactly the cited passages, in new-number order:
        // the model's [2] became [1], its [1] became [2].
        const headers = promptSourceHeaders(chat);
        expect(Object.keys(headers)).toHaveLength(6);
        expect(res.body.sources).toHaveLength(2);
        expect(headers[2].startsWith(`${res.body.sources[0].title} `)).toBe(true);
        expect(headers[1].startsWith(`${res.body.sources[1].title} `)).toBe(true);

        // The retrieval really found the relevant session.
        expect(Object.values(headers).some((h) => h.startsWith('Usability Test — Ambient AI Scribe Prototype v0.1 '))).toBe(true);

        const userContent = chat.body.messages[1].content;
        for (const source of res.body.sources) {
            expect(source).toEqual({
                id: expect.stringMatching(new RegExp(`^${source.recordId.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}#\\d+$`)),
                kind: expect.stringMatching(/^(interview|survey|transcript|synthesis|doc)$/),
                title: expect.any(String),
                excerpt: expect.any(String),
                project: null,
                // This corpus has no projects.yml, so no record has a project tag.
                recordProject: null,
                date: expect.stringMatching(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/),
                contextBefore: source.contextBefore === null ? null : expect.any(String),
                contextAfter: source.contextAfter === null ? null : expect.any(String),
                section: source.section === null ? null : expect.any(String),
                recordId: expect.stringMatching(/^(raw|finding|component|analytics|deliverable):/),
                recordKind: expect.any(String),
                recordType: source.recordType === null ? null : expect.any(String),
                score: expect.any(Number),
            });
            // The excerpt is exactly the passage text the model was shown.
            expect(userContent).toContain(source.excerpt);
            expect(source.score).toBeGreaterThan(0);
            expect(source.score).toBeLessThanOrEqual(1);
        }
    });

    it('maps a raw usability-test record to the transcript kind with real surrounding context', async () => {
        const res = await agent.post('/api/ask').send({
            question: 'medication dosages garbled scribe sessions physicians disqualifying sign-off',
        });
        const headers = promptSourceHeaders(fakeOllama.requestsTo('/api/chat')[0]);
        // The fake reply cites [2] then [1], so the top-ranked passage — the
        // usability test's Key Findings — comes back as sources[1].
        expect(headers[1]).toMatch(/^Usability Test — Ambient AI Scribe Prototype v0\.1 — Key Findings \(/);
        const source = res.body.sources[1];
        expect(source).toMatchObject({
            kind: 'transcript',
            recordKind: 'raw',
            recordType: 'usability-test',
            date: 'Feb 25, 2025',
            section: 'Key Findings',
        });
        expect(source.excerpt).toMatch(/garbled medication dosages in 3 of 5/);
        expect(source.contextBefore).toMatch(/Moderated usability test/);
        expect(source.contextAfter).toMatch(/4 of 5 participants read every line/);
    });

    it('embeds the corpus once and only embeds the question on later requests', async () => {
        await agent.post('/api/ask').send({ question: 'first question to warm the cache' });
        fakeOllama.reset();

        const res = await agent.post('/api/ask').send({ question: 'what about PHI governance?' });

        expect(res.status).toBe(200);
        const embeds = fakeOllama.requestsTo('/api/embed');
        expect(embeds).toHaveLength(1);
        expect(embeds[0].body.input).toEqual(['search_query: what about PHI governance?']);
    });

    it('re-embeds only the changed passage after a record is edited', async () => {
        await agent.post('/api/ask').send({ question: 'warm the cache' });
        const id = 'raw:2025-02-25-usability-test-ambient-scribe-v01';
        const record = (await agent.get(`/api/records/${encodeURIComponent(id)}`)).body;
        const edited = record.rawContent.replace(
            'The scribe correctly captured',
            'The scribe (edited in test) correctly captured',
        );
        const putRes = await agent.put(`/api/records/${encodeURIComponent(id)}`).send({ content: edited });
        expect(putRes.status).toBe(200);
        fakeOllama.reset();

        const res = await agent.post('/api/ask').send({ question: 'edited in test' });

        expect(res.status).toBe(200);
        const [corpusEmbed, queryEmbed] = fakeOllama.requestsTo('/api/embed');
        expect(corpusEmbed.body.input).toHaveLength(1);
        expect(corpusEmbed.body.input[0]).toMatch(/^search_document: .*\n[\s\S]*edited in test/);
        expect(queryEmbed.body.input).toEqual(['search_query: edited in test']);
    });

    it('restricts retrieval to records tagged with the project and echoes it on sources', async () => {
        const res = await agent.post('/api/ask').send({ question: 'What are the risks?', project: 'governance' });

        expect(res.status).toBe(200);
        const tagged = (await agent.get('/api/records?summary=true')).body
            .filter((r) => r.tags.includes('governance'))
            .map((r) => r.title);
        const untaggedCount = (await agent.get('/api/records?summary=true')).body.length - tagged.length;
        expect(tagged.length).toBeGreaterThan(0);
        expect(untaggedCount).toBeGreaterThan(0);

        // One passage per tagged record reaches the model, and nothing else.
        const headers = Object.values(promptSourceHeaders(fakeOllama.requestsTo('/api/chat')[0]));
        expect(headers).toHaveLength(tagged.length);
        expect(headers.every((h) => tagged.some((title) => h.startsWith(`${title} `)))).toBe(true);
        expect(res.body.sources.length).toBeGreaterThan(0);
        expect(res.body.sources.every((s) => s.project === 'governance')).toBe(true);
    });

    it('treats project "all" as no filter', async () => {
        const res = await agent.post('/api/ask').send({ question: 'ambient scribe trust', project: 'all' });

        expect(res.status).toBe(200);
        expect(Object.keys(promptSourceHeaders(fakeOllama.requestsTo('/api/chat')[0]))).toHaveLength(6);
        expect(res.body.sources.every((s) => s.project === null)).toBe(true);
    });

    it('answers without calling the model when no record has the project tag', async () => {
        const res = await agent.post('/api/ask').send({ question: 'anything', project: 'checkout' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            answer: 'No records in the repo are tagged "checkout", so there\'s nothing to answer from.',
            sources: [],
            model: 'gemma2:9b',
        });
        expect(fakeOllama.requestsTo('/api/chat')).toHaveLength(0);
    });

    it('returns a generic 502 when Ollama fails, without leaking its error', async () => {
        await agent.post('/api/ask').send({ question: 'warm the cache' });
        fakeOllama.reset();
        fakeOllama.state.failNext = 500;
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await agent.post('/api/ask').send({ question: 'anything' });

        expect(res.status).toBe(502);
        expect(res.body).toEqual({ error: 'the local language model is unavailable' });
        expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/model runner has unexpectedly stopped/));
        errorSpy.mockRestore();
    });
});

describe('GET /api/ask/config', () => {
    it('rejects a request without a session', async () => {
        const res = await request(server).get('/api/ask/config');
        expect(res.status).toBe(401);
    });

    it('is enabled, with no projects in a corpus without projects.yml', async () => {
        const res = await agent.get('/api/ask/config');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: true, projects: [] });
        expect(fakeOllama.state.requests).toHaveLength(0);
    });
});
