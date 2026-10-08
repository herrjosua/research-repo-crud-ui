const path = require('path');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const { startFakeOllama } = require('./helpers/fakeOllama');
const { TOP_K } = require('../ask/pipeline');

// Integration test for POST /api/ask: the real app, the real
// export_records.py over E2E's fixed corpus (real repo content), and a fake
// Ollama that speaks Ollama's actual HTTP/JSON API (see helpers/fakeOllama.js).
// tests/ask.live.test.js runs the same flow against a real local Ollama.

const CORPUS_DIR = path.join(__dirname, '..', '..', 'e2e', 'fixtures', 'corpus');

// What the fake model "says": markdown and HTML the server must flatten, and
// citations out of order plus one ([99]) pointing past every source given.
const MODEL_REPLY = [
    '## Summary',
    '',
    'Physicians **did not trust** the draft enough to skim it [2]. Medication dosages were',
    'garbled in 3 of 5 sessions [1][2], see [the notes](https://example.com/x).',
    '',
    '<script>alert("x")</script>* Edit affordance was hard to find [99]',
].join('\n');

// For the checks test: an invented figure, stacked on three sources.
const INVENTED_QUESTION = 'What share of physicians abandoned the scribe?';
const INVENTED_REPLY = '97% of physicians abandoned the scribe [1][2][3].';

let testRepoPath;
let fakeOllama;
let app, sessionDb, clearSessionInterval, db, server, request, agent;

beforeAll(async () => {
    fakeOllama = await startFakeOllama({
        chatReply: (body) => (body.messages.at(-1).content.endsWith(`Question: ${INVENTED_QUESTION}`) ? INVENTED_REPLY : MODEL_REPLY),
    });
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

// Each source's label line in the sources block the backend sent to the
// model ("[n] RAW SESSION · usability test · Feb 25, 2025 — Title — Section",
// see ask/answer.js), keyed by n, without the class, method and date: just
// "Title — Section". Titles can contain " — " themselves, so tests match a
// header by its title with isHeaderFor().
const LABEL_RE = /^\[(\d+)\] (RAW SESSION|SYNTHESIS|DOC)((?: · [^·—\n]+)*) — (.+)$/gm;

function promptSourceLabels(chatRequest) {
    const userContent = chatRequest.body.messages.find((m) => m.role === 'user').content;
    return [...userContent.matchAll(LABEL_RE)].map((m) => ({
        n: Number(m[1]), cls: m[2], meta: m[3].split(' · ').filter(Boolean), header: m[4],
    }));
}

function promptSourceHeaders(chatRequest) {
    return Object.fromEntries(promptSourceLabels(chatRequest).map((l) => [l.n, l.header]));
}

function isHeaderFor(header, title) {
    return header === title || header.startsWith(`${title} — `);
}

// The distinct records behind a prompt's sources (a raw session can have two
// passages, ask/pipeline.js RETRIEVAL.passagesPerRaw), by their titles.
function shownRecordTitles(chatRequest, records) {
    const titles = Object.values(promptSourceHeaders(chatRequest))
        // The longest matching title, since one title can prefix another.
        .map((h) => records.map((r) => r.title).filter((t) => isHeaderFor(h, t)).sort((a, b) => b.length - a.length)[0]);
    return [...new Set(titles)];
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
        // the bullet is normalized, and the out-of-range [99] is dropped.
        expect(res.body.answer).toBe([
            'Summary',
            '',
            'Physicians did not trust the draft enough to skim it [1]. Medication dosages were',
            'garbled in 3 of 5 sessions [2][1], see the notes.',
            '',
            '- Edit affordance was hard to find',
        ].join('\n'));

        // Flags on the answer as returned (ask/checks.js), which is left as
        // the model wrote it. The hard line break splits "Medication dosages
        // were" from its citation, so it counts as uncited.
        expect(res.body.checks).toEqual({
            retried: false,
            uncited: ['Summary', 'Medication dosages were', 'Edit affordance was hard to find'],
            unsupportedFigures: [],
            stacked: [],
        });

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
        const records = (await agent.get('/api/records?summary=true')).body;
        expect(shownRecordTitles(chat, records)).toHaveLength(TOP_K);
        expect(res.body.sources).toHaveLength(2);
        expect(isHeaderFor(headers[2], res.body.sources[0].title)).toBe(true);
        expect(isHeaderFor(headers[1], res.body.sources[1].title)).toBe(true);

        // The retrieval really found the relevant session.
        expect(Object.values(headers).some((h) => isHeaderFor(h, 'Usability Test — Ambient AI Scribe Prototype v0.1'))).toBe(true);

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
                // A raw session's roster line; null for every other record.
                participants: source.recordKind === 'raw' ? expect.stringMatching(/^Participants: /) : null,
                // These scripts may show raw corrections; this corpus has none.
                correction: null,
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

    it('flags an invented figure and a citation stack without changing the answer', async () => {
        const res = await agent.post('/api/ask').send({ question: INVENTED_QUESTION });

        expect(res.status).toBe(200);
        expect(res.body.answer).toBe(INVENTED_REPLY);
        expect(res.body.sources).toHaveLength(3);
        expect(res.body.checks).toEqual({
            retried: false,
            uncited: [],
            unsupportedFigures: ['97'],
            stacked: ['97% of physicians abandoned the scribe.'],
        });
    });

    it('maps a raw usability-test record to the transcript kind with real surrounding context', async () => {
        const res = await agent.post('/api/ask').send({
            question: 'medication dosages garbled scribe sessions physicians disqualifying sign-off',
        });
        const headers = promptSourceHeaders(fakeOllama.requestsTo('/api/chat')[0]);
        // The fake reply cites [2] then [1], so the top-ranked passage — the
        // usability test's Key Findings — comes back as sources[1].
        expect(headers[1]).toBe('Usability Test — Ambient AI Scribe Prototype v0.1 — Key Findings');
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

    it('labels each source for the model as a raw session, synthesis or doc', async () => {
        await agent.post('/api/ask').send({
            question: 'medication dosages garbled scribe sessions physicians disqualifying sign-off',
        });
        const [chat] = fakeOllama.requestsTo('/api/chat');
        const userContent = chat.body.messages[1].content;
        const labels = promptSourceLabels(chat);

        // Every source has a label, and every label is one of the three forms.
        expect(labels).toHaveLength((userContent.match(/^\[\d+\] /gm) || []).length);
        expect(labels[0]).toEqual({
            n: 1,
            cls: 'RAW SESSION',
            meta: ['usability test', 'Feb 25, 2025'],
            header: 'Usability Test — Ambient AI Scribe Prototype v0.1 — Key Findings',
        });
        const records = (await agent.get('/api/records?summary=true')).body;
        for (const label of labels) {
            const record = records.find((r) => isHeaderFor(label.header, r.title));
            const expected = { raw: 'RAW SESSION', finding: 'SYNTHESIS', analytics: 'SYNTHESIS' }[record.kind] || 'DOC';
            expect(label.cls).toBe(expected);
        }
        // The rules that go with the labels.
        expect(chat.body.messages[0].content).toMatch(/prefer RAW SESSION sources/);
        expect(chat.body.messages[0].content).toMatch(/one or two sources/);
    });

    it("never retrieves rosters or link lists, and heads a raw session's sources with its roster", async () => {
        await agent.post('/api/ask').send({ question: 'Who were the participants? Care coordinator roles, researcher, recruitment' });
        const [chat] = fakeOllama.requestsTo('/api/chat');
        const userContent = chat.body.messages[1].content;
        const labels = promptSourceLabels(chat);

        expect(labels.some((l) => /— (Participants — .*|Related|Evidence Trail|Related Findings)$/.test(l.header))).toBe(false);
        expect(userContent).not.toMatch(/Recruitment note|Synthesized into/);
        // Every raw session's source is followed by its roster line.
        const raws = labels.filter((l) => l.cls === 'RAW SESSION');
        expect(raws.length).toBeGreaterThan(0);
        for (const l of raws) {
            const block = userContent.split(`[${l.n}] `)[1].split('\n');
            expect(block[1]).toMatch(/^Participants: \d+ — \S/);
        }
        expect(userContent).toContain('Participants: 3 — Care Coordinator ×2, Care Coordinator (float pool) ×1');
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

        // Every tagged record reaches the model (a raw session with up to two
        // passages, anything else with one), and nothing else.
        const chat = fakeOllama.requestsTo('/api/chat')[0];
        const records = (await agent.get('/api/records?summary=true')).body;
        const headers = Object.values(promptSourceHeaders(chat));
        expect(shownRecordTitles(chat, records).sort()).toEqual([...tagged].sort());
        expect(headers.every((h) => tagged.some((title) => isHeaderFor(h, title)))).toBe(true);
        const kindOf = (title) => records.find((r) => r.title === title).kind;
        for (const title of tagged) {
            const count = headers.filter((h) => isHeaderFor(h, title)).length;
            expect(count).toBeLessThanOrEqual(kindOf(title) === 'raw' ? 2 : 1);
        }
        expect(res.body.sources.length).toBeGreaterThan(0);
        expect(res.body.sources.every((s) => s.project === 'governance')).toBe(true);
    });

    it('treats project "all" as no filter', async () => {
        const res = await agent.post('/api/ask').send({ question: 'ambient scribe trust', project: 'all' });

        expect(res.status).toBe(200);
        const records = (await agent.get('/api/records?summary=true')).body;
        expect(shownRecordTitles(fakeOllama.requestsTo('/api/chat')[0], records)).toHaveLength(TOP_K);
        expect(res.body.sources.every((s) => s.project === null)).toBe(true);
    });

    it('answers without calling the model when no record has the project tag', async () => {
        const res = await agent.post('/api/ask').send({ question: 'anything', project: 'checkout' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            answer: 'No records in the repo are tagged "checkout", so there\'s nothing to answer from.',
            sources: [],
            model: 'gemma2:9b',
            // The model wrote nothing, so there is nothing to flag.
            checks: { retried: false, uncited: [], unsupportedFigures: [], stacked: [] },
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
        expect(res.body).toEqual({ enabled: true, mode: 'live', projects: [] });
        expect(fakeOllama.state.requests).toHaveLength(0);
    });
});
