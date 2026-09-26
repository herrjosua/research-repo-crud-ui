// Adversarial security tests — real attack payloads fired at the actual running
// app (via supertest, in-process). Each describe block below documents the
// vector under test, why it's a plausible risk, and whether it turned out to
// be a real vulnerability or something that was already safe.
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

let testRepoPath;
let app, sessionDb, clearSessionInterval;
let request, db, agent, server;

beforeAll(async () => {
    testRepoPath = createTestRepo();
    process.env.AGENTIC_REPO_ROOT = testRepoPath;

    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');

    // One persistent server for the whole file — see auth.test.js's beforeAll
    // for why: passing the bare `app` to request()/request.agent() makes
    // supertest bind and tear down a brand-new ephemeral TCP listener for
    // every single assertion, which raced intermittently under this suite's
    // concurrent git/python3 subprocess and bcrypt load.
    server = app.listen(0);
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('security-tester');

    agent = request.agent(server);
    const signupRes = await agent.post('/api/auth/signup').send({
        username: 'security-tester',
        password: 'a-real-password-123',
        gitName: 'Security Tester',
        gitEmail: 'security-tester@example.com',
    });
    if (signupRes.status !== 201) {
        throw new Error(
            `security.test.js beforeAll: signup failed with ${signupRes.status}: ${JSON.stringify(signupRes.body)}`,
        );
    }
});

afterAll(async () => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
    server.close();
    delete process.env.AGENTIC_REPO_ROOT;
    await destroyTestRepo(testRepoPath);
});

// ---------------------------------------------------------------------------
// VECTOR 1 — Path traversal via topicSlug/slug
//
// POST /api/sessions passes topicSlug (raw mode) / slug (deliverable mode)
// straight through to new_research_session.py as argv, via execFile (no
// shell, so no shell-metacharacter injection) — but the actual code in
// new_research_session.py does:
//   folder_name = f"{args.date}-{args.topic_slug}"; folder_path = RAW_ROOT / folder_name
//   file_path = folder_path / f"{args.slug}.md"
// with zero validation of either value anywhere in the script (confirmed by
// reading it directly — no regex/allowlist check exists). pathlib's `/`
// operator treats "/" and ".." inside the string as real path separators and
// parent-directory references, and if the joined operand is itself absolute,
// it discards the base entirely. So this is a real path traversal risk,
// confirmed against the actual script before touching any test code.
// ---------------------------------------------------------------------------
describe('VECTOR 1: path traversal via topicSlug/slug', () => {
    // Enough "../" to escape any plausible OS temp-dir nesting depth and land
    // at filesystem root, regardless of how deep the fixture repo happens to
    // be nested (extra ".." above root are a no-op, so overshooting is safe).
    const TRAVERSAL_UP = '../'.repeat(20);

    async function cleanupMarker(markerPath) {
        // maxRetries/retryDelay guard against the same transient ENOTEMPTY/EBUSY
        // race setupTestRepo.js documents for recursive deletes on macOS — without
        // it, a stray copy of the escaped payload can survive in the real /tmp.
        await fs.rm(markerPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    }

    it('rejects a raw-mode topicSlug that escapes RAW_ROOT via ../ segments', async () => {
        const marker = `rrcrud-security-test-raw-${Date.now()}`;
        const escapedDir = path.join(os.tmpdir(), marker);

        try {
            const res = await agent.post('/api/sessions').send({
                mode: 'raw',
                title: 'Evil session',
                type: 'interview',
                topicSlug: `${TRAVERSAL_UP}tmp/${marker}`,
                date: '2026-01-01',
            });

            // The fix under test: the Express route must reject this with 400
            // BEFORE it ever reaches new_research_session.py.
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/topicSlug/);

            // Belt-and-suspenders: confirm no folder was actually created
            // outside the fixture repo. This is what actually proves the
            // vulnerability (or its absence) rather than trusting the status
            // code alone.
            await expect(fs.access(escapedDir)).rejects.toThrow();
        } finally {
            await cleanupMarker(escapedDir);
            await cleanupMarker(path.join(os.tmpdir(), marker)); // in case of overshoot naming
        }
    });

    it('rejects a deliverable-mode slug that is an absolute path', async () => {
        const marker = `rrcrud-security-test-deliverable-${Date.now()}`;
        const escapedFile = path.join(os.tmpdir(), `${marker}.md`);

        try {
            const res = await agent.post('/api/sessions').send({
                mode: 'deliverable',
                folder: 'personas',
                title: 'Evil deliverable',
                slug: path.join(os.tmpdir(), marker), // absolute path — pathlib's `/` would discard the base entirely
            });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/slug/);

            await expect(fs.access(escapedFile)).rejects.toThrow();
        } finally {
            await cleanupMarker(escapedFile);
        }
    });

    it('rejects a topicSlug containing a null byte', async () => {
        const res = await agent.post('/api/sessions').send({
            mode: 'raw',
            title: 'Evil session',
            type: 'interview',
            topicSlug: 'legit-looking-slug\x00../../etc',
            date: '2026-01-01',
        });
        expect(res.status).toBe(400);
    });

    it('still accepts a legitimate kebab-case topicSlug', async () => {
        const res = await agent.post('/api/sessions').send({
            mode: 'raw',
            title: 'Legit session',
            type: 'interview',
            topicSlug: 'a-perfectly-normal-slug',
            date: '2026-01-02',
        });
        expect(res.status).toBe(201);
    });

    it('still accepts a legitimate kebab-case deliverable slug', async () => {
        const res = await agent.post('/api/sessions').send({
            mode: 'deliverable',
            folder: 'personas',
            title: 'Legit deliverable',
            slug: 'a-perfectly-normal-deliverable-slug',
        });
        expect(res.status).toBe(201);
    });
});

// ---------------------------------------------------------------------------
// VECTOR 2 — SQL injection via username/password
//
// Read auth.js directly: every query is db.prepare('...?...').get(username)
// / .run(...) — better-sqlite3's parameterized form, never string
// concatenation. This test fires classic injection payloads anyway, both to
// confirm that belief against the real running app (not just the source
// reading) and to stand as a regression guard against a future change
// accidentally introducing string concatenation.
// ---------------------------------------------------------------------------
describe('VECTOR 2: SQL injection via username/password', () => {
    const injectionPayloads = [
        "' OR '1'='1",
        "' OR 1=1--",
        "admin'--",
        "'; DROP TABLE users; --",
        "' UNION SELECT id, username, password_hash, git_name, git_email FROM users--",
    ];

    it.each(injectionPayloads)('rejects login injection payload %p as an invalid username/password, not a bypass', async (payload) => {
        const res = await request(server).post('/api/auth/login').send({
            username: payload,
            password: payload,
        });
        // A working injection would either log us in (200) or 500 on a SQL
        // syntax error. The only acceptable outcome is "no such user".
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid username or password/);
    });

    it('rejects a signup injection payload as an ordinary username, not a bypass', async () => {
        // The test db file persists across separate `npm test` runs (see
        // records.test.js's beforeAll) — delete any leftover row from a
        // previous run so this always gets a clean 201, not a stale 409.
        db.prepare("DELETE FROM users WHERE username = ?").run("' OR '1'='1");

        const res = await request(server).post('/api/auth/signup').send({
            username: "' OR '1'='1",
            password: 'a-real-password-123',
            gitName: 'Injector',
            gitEmail: 'injector@example.com',
        });
        // Should succeed as a literal, oddly-named user — never a SQL error.
        expect(res.status).toBe(201);
        expect(res.body.username).toBe("' OR '1'='1");
    });

    it("survives a DROP TABLE payload without actually dropping the users table", async () => {
        await request(server).post('/api/auth/login').send({
            username: "x'; DROP TABLE users; --",
            password: 'whatever',
        });
        // If the table were actually dropped, this would throw instead of
        // returning a normal count.
        const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
        expect(row.n).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// VECTOR 3 — Oversized request bodies
//
// app.js calls app.use(express.json()) with no options object at all, so
// body-parser's documented default (100kb) applies. Confirmed the 100kb
// limit is genuinely enforced. But investigating this surfaced a REAL,
// separate vulnerability: app.js has no error-handling middleware, so
// PayloadTooLargeError (and any other error passed to next()) falls through
// to Express's built-in finalhandler, which — outside NODE_ENV=production —
// renders a full HTML page containing the server's stack trace, including
// absolute filesystem paths and node_modules internals. This is trivially
// reachable (confirmed the same leak on a plain malformed-JSON body, not
// just an oversized one), so it's fixed here with a generic JSON error
// handler in app.js.
// ---------------------------------------------------------------------------
describe('VECTOR 3: oversized request bodies', () => {
    it('rejects a body over the 100kb default limit with 413', async () => {
        const oversized = 'a'.repeat(200 * 1024);
        const res = await request(server).post('/api/auth/login').send({ username: 'x', password: oversized });
        expect(res.status).toBe(413);
    });

    it('does not leak a stack trace or filesystem paths for an oversized body', async () => {
        const oversized = 'a'.repeat(200 * 1024);
        const res = await request(server).post('/api/auth/login').send({ username: 'x', password: oversized });

        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.text).not.toMatch(/node_modules/);
        expect(res.text).not.toMatch(/\.js:\d+:\d+/); // "file.js:12:34"-style stack frames
        expect(res.text).not.toMatch(/at\s+\S+\s+\(/); // "at functionName (" stack frames
    });

    it('does not leak a stack trace for a malformed (truncated) JSON body either', async () => {
        const res = await request(server)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"username": "x", "password": ');

        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.text).not.toMatch(/node_modules/);
    });

    it('accepts a normal-sized body as before', async () => {
        const res = await request(server).post('/api/auth/login').send({ username: 'nobody', password: 'whatever' });
        expect(res.status).toBe(401); // wrong creds, but proves the request itself was processed normally
    });
});

// ---------------------------------------------------------------------------
// VECTOR 4 — Malformed/tampered session cookies
//
// express-session signs the session-id cookie with SESSION_SECRET. A cookie
// that doesn't verify just fails to resolve to a stored session, so
// req.session.userId is undefined and requireAuth's existing check does the
// rest. Confirmed directly against the running app that this already
// degrades to a clean 401 with a plain JSON body — already safe, kept here
// as a regression guard.
// ---------------------------------------------------------------------------
describe('VECTOR 4: malformed/tampered session cookies', () => {
    const badCookies = [
        'connect.sid=garbage-not-a-real-cookie',
        'connect.sid=s%3Anot-a-valid-signed-value.fakesignaturegoeshere',
        'connect.sid=' + 's:'.repeat(500), // pathological repeated-prefix garbage
        'connect.sid=; connect.sid=also-garbage', // duplicate/malformed header
    ];

    it.each(badCookies)('degrades a tampered cookie (%s) to a clean 401 with no leak', async (cookie) => {
        const res = await request(server).get('/api/records').set('Cookie', cookie);

        expect(res.status).toBe(401);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual({ error: 'not logged in' });
        expect(res.text).not.toMatch(/node_modules|at\s+\S+\s+\(/);
    });

    it('rejects a request with no cookie at all the same way', async () => {
        const res = await request(server).get('/api/records');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'not logged in' });
    });
});

// ---------------------------------------------------------------------------
// VECTOR 5 — HTML/script injection into PUT /records/:id content
//
// GET /records/:id returns an `html` field produced by agentic-repo's
// md_render.py (render_markdown), which the frontend renders via
// dangerouslySetInnerHTML. Read md_render.py directly:
//   - Raw text goes through html.escape(text, quote=False) before any
//     markdown transforms run, so literal <script>/<img onerror=...> tags
//     ARE escaped to &lt;script&gt; etc. That part is already safe.
//   - BUT the markdown-link transform runs on the ALREADY-escaped text and
//     splices the URL capture group directly into `href="..."` with no
//     further escaping, and html.escape was called with quote=False (so
//     literal " characters in the URL are never escaped either). That means
//     a markdown link can both (a) use a javascript: URI, and (b) break out
//     of the href attribute to inject a brand-new event-handler attribute
//     onto the <a> tag.
// Confirmed both by running md_render.py directly against these exact
// payloads before writing this test, then fixed it in agentic-repo (a
// separate git repo from this one — see md_render.py's 2026-09-18 comment)
// by switching to escape(quote=True) and allowlisting the URL scheme.
// ---------------------------------------------------------------------------
describe('VECTOR 5: HTML/script injection into PUT /records/:id content', () => {
    const recordId = 'raw:2026-01-02-a-perfectly-normal-slug';

    it('escapes a raw <script> tag embedded in markdown content (already safe)', async () => {
        await agent.put(`/api/records/${recordId}`).send({
            content: '<script>alert(document.cookie)</script>',
        });

        const res = await agent.get(`/api/records/${recordId}`);
        expect(res.status).toBe(200);
        expect(res.body.html).not.toMatch(/<script>/);
        expect(res.body.html).toMatch(/&lt;script&gt;/);
    });

    it('escapes a raw <img onerror=...> tag embedded in markdown content (already safe)', async () => {
        await agent.put(`/api/records/${recordId}`).send({
            content: '<img src=x onerror=alert(1)>',
        });

        const res = await agent.get(`/api/records/${recordId}`);
        expect(res.status).toBe(200);
        expect(res.body.html).not.toMatch(/<img/);
    });

    // --- These two were a REAL vulnerability, found by testing before fixing:
    // md_render.py's markdown-link transform spliced the URL straight into
    // href="..." after escaping the surrounding text with quote=False (so a
    // literal " in the URL was never entity-encoded) and with no URL-scheme
    // check at all. Confirmed both payloads landed live in the API response
    // exactly as a browser would receive it via dangerouslySetInnerHTML.
    // Fixed in agentic-repo/research/scripts/md_render.py: escape(quote=True)
    // plus an http(s)/mailto/relative scheme allowlist (see that file's
    // 2026-09-18 comment for the full writeup). These now assert the fixed
    // behavior — a link with an untrusted scheme or a quote-breakout payload
    // must never produce a live <a href> or a second attacker attribute.
    it('neutralizes a javascript: URI in a markdown link instead of making it a live href', async () => {
        await agent.put(`/api/records/${recordId}`).send({
            content: '[click me](javascript:alert(document.cookie))',
        });

        const res = await agent.get(`/api/records/${recordId}`);
        expect(res.status).toBe(200);
        expect(res.body.html).not.toMatch(/href="javascript:/);
    });

    it('prevents attribute-injection XSS via a markdown link URL', async () => {
        await agent.put(`/api/records/${recordId}`).send({
            content: '[click me](x" onmouseover="location=\'http://evil.test\'")',
        });

        const res = await agent.get(`/api/records/${recordId}`);
        expect(res.status).toBe(200);
        // Before the fix, this produced a literal, unescaped
        // href="x" onmouseover="..." — a second, attacker-controlled live
        // attribute on the <a> tag. The fix disarms the whole link into inert
        // escaped text (which harmlessly still contains the substring
        // "onmouseover=" as plain, non-attribute characters) — so the actual
        // security property to assert is that the exploit's exact unescaped
        // attribute-breakout signature never appears, not that the word
        // never appears anywhere in the output.
        expect(res.body.html).not.toContain('href="x" onmouseover="');
        expect(res.body.html).not.toMatch(/<a[^>]*\bonmouseover=/);
    });

    it('still renders a legitimate https:// markdown link as a live href', async () => {
        await agent.put(`/api/records/${recordId}`).send({
            content: '[docs](https://example.com/path?a=1&b=2)',
        });

        const res = await agent.get(`/api/records/${recordId}`);
        expect(res.status).toBe(200);
        expect(res.body.html).toContain('<a href="https://example.com/path?a=1&amp;b=2">docs</a>');
    });
});

// ---------------------------------------------------------------------------
// VECTOR 6 — Missing security headers, crawlable public deploy, and
// unbounded write-endpoint requests
//
// Three checklist items from the v1.2 security hardening pass, grouped
// together since none needed an attack payload to confirm — each is a
// missing-control check (a header, a route, a request count) rather than an
// injection/traversal vector like 1-5 above.
// ---------------------------------------------------------------------------
describe('VECTOR 6: security headers, robots.txt, and write-route rate limiting', () => {
    it('sets helmet security headers on every response', async () => {
        const res = await agent.get('/api/auth/me');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('serves a robots.txt disallowing all crawling', async () => {
        const res = await request(server).get('/robots.txt');
        expect(res.status).toBe(200);
        expect(res.text).toMatch(/User-agent: \*/);
        expect(res.text).toMatch(/Disallow: \//);
    });

    it('rate-limits POST /api/sessions after repeated requests from the same client', async () => {
        require('../middleware/rateLimiter')._resetForTests();

        let lastStatus;
        for (let i = 0; i < 31; i++) {
            // Deliberately invalid body — the limiter must fire before the
            // route's own validation ever runs, same ordering confirmed
            // manually via curl.
            const res = await agent.post('/api/sessions').send({ mode: 'raw' });
            lastStatus = res.status;
        }
        expect(lastStatus).toBe(429);

        // Don't leak this test's spent budget into any test that runs after
        // this file, or into a future new vector added below it.
        require('../middleware/rateLimiter')._resetForTests();
    });
});

// ---------------------------------------------------------------------------
// VECTOR 7 — HTTPS redirect middleware
//
// Tested directly against the middleware function with mock req/res/next,
// not through the running `app` — app.js bakes isProduction into a
// module-level constant at require() time (from NODE_ENV, which Jest fixes
// to "test" for the whole run), and reloading app.js under
// NODE_ENV=production to exercise this would also flip its isTest flag and
// point sessionDb at the real dev app.db file instead of a scoped test
// database. Manually confirmed end-to-end against a real NODE_ENV=production
// server via curl before writing this (301 with no X-Forwarded-Proto, 401
// pass-through with X-Forwarded-Proto: https) — this test guards that same
// behavior at the unit level.
// ---------------------------------------------------------------------------
describe('VECTOR 7: HTTPS redirect middleware', () => {
    const httpsRedirect = require('../middleware/httpsRedirect');

    // req.secure is what Express derives from X-Forwarded-Proto when the
    // proxy is trusted; the middleware reads that, not the raw header.
    function mockReqRes(headers, secure = false) {
        const req = { headers, secure, url: '/api/auth/me' };
        const res = { redirect: jest.fn() };
        const next = jest.fn();
        return { req, res, next };
    }

    it('redirects to https when in production and the request was not already https', () => {
        const middleware = httpsRedirect(true);
        const { req, res, next } = mockReqRes({ host: 'localhost:3001' });

        middleware(req, res, next);

        expect(res.redirect).toHaveBeenCalledWith(301, 'https://localhost:3001/api/auth/me');
        expect(next).not.toHaveBeenCalled();
    });

    it('passes through without redirecting when the request was already https', () => {
        const middleware = httpsRedirect(true);
        const { req, res, next } = mockReqRes({ host: 'localhost:3001' }, true);

        middleware(req, res, next);

        expect(res.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('never redirects when not in production, regardless of headers', () => {
        const middleware = httpsRedirect(false);
        const { req, res, next } = mockReqRes({ host: 'localhost:3001' });

        middleware(req, res, next);

        expect(res.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// VECTOR 8 — Python-traceback masking on subprocess errors
//
// Tested directly against the exported scriptErrorMessage() helper, not
// through a real subprocess crash — deliberately breaking a Python script
// (or PYTHON_BIN) to force a genuine unhandled exception in the fixture repo
// would be fragile and invasive to the test setup shared by every other test
// in this file and in records.test.js. Same reasoning as VECTOR 7: unit-test
// the pure function directly with realistic mock error objects, having
// already manually confirmed the real behavior once (see records.js's own
// comment on scriptErrorMessage for the mechanism).
// ---------------------------------------------------------------------------
describe('VECTOR 8: Python-traceback masking on subprocess errors', () => {
    let scriptErrorMessage;

    beforeAll(() => {
        // Deliberately required here, not at describe-body scope: a
        // describe() callback runs synchronously during Jest's collection
        // pass, before this file's own top-level beforeAll (which sets
        // AGENTIC_REPO_ROOT and requires ../app, triggering dotenv) has run.
        // Requiring ../routes/records that early froze its module-level
        // PYTHON_BIN/AGENTIC_REPO_ROOT consts against an unloaded .env, and
        // then poisoned the module cache for every later require in this
        // file, including the one inside ../app.
        ({ _scriptErrorMessage: scriptErrorMessage } = require('../routes/records'));
    });

    it('masks a genuine Python traceback and logs it server-side instead of forwarding it', () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const fakeTraceback = [
            'Traceback (most recent call last):',
            '  File "/home/deploy/agentic-repo/research/scripts/export_records.py", line 42, in <module>',
            "    raise ValueError('something broke')",
            'ValueError: something broke',
        ].join('\n');

        const result = scriptErrorMessage({ stderr: fakeTraceback }, 'TEST CONTEXT');

        expect(result.isCrash).toBe(true);
        expect(result.message).toBe('internal server error');
        // The real detail must still be logged server-side — masking it from
        // the client is not the same as losing it entirely.
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('TEST CONTEXT'));
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(fakeTraceback));

        consoleErrorSpy.mockRestore();
    });

    it('passes a clean, expected script error message straight through unchanged', () => {
        const result = scriptErrorMessage({ stderr: 'No record found for id: raw:does-not-exist' }, 'TEST CONTEXT');

        expect(result.isCrash).toBe(false);
        expect(result.message).toBe('No record found for id: raw:does-not-exist');
    });

    it('falls back to err.message when stderr is absent, without misidentifying it as a crash', () => {
        const result = scriptErrorMessage({ message: 'ENOENT: no such file or directory' }, 'TEST CONTEXT');

        expect(result.isCrash).toBe(false);
        expect(result.message).toBe('ENOENT: no such file or directory');
    });
});

// ---------------------------------------------------------------------------
// VECTOR 9 — Line breaks in single-line frontmatter fields
//
// A \n or \r in a frontmatter value could split it across YAML lines and
// inject extra keys. agentic-repo's scripts now quote every value (v0.5.21),
// and PUT writes through gray-matter, but both routes now also reject line
// breaks in frontmatter strings up front (validation.js) — while still
// allowing them in the Markdown body fields (methodLabel, description, PUT
// content).
// ---------------------------------------------------------------------------
describe('VECTOR 9: line breaks in frontmatter fields', () => {
    beforeEach(() => require('../middleware/rateLimiter')._resetForTests());

    const recordId = 'raw:2026-01-02-a-perfectly-normal-slug';
    const raw = (overrides) => ({
        mode: 'raw',
        title: 'Line break test',
        type: 'interview',
        topicSlug: 'line-break-test',
        ...overrides,
    });

    it('rejects a newline in a raw session title', async () => {
        const res = await agent.post('/api/sessions').send(raw({ title: 'Legit\nstatus: final' }));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/title cannot contain line breaks/);
    });

    it('rejects a carriage return in researcher', async () => {
        const res = await agent.post('/api/sessions').send(raw({ researcher: 'Security Tester\rx' }));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/researcher cannot contain line breaks/);
    });

    it('rejects a newline inside a tag item', async () => {
        const res = await agent.post('/api/sessions').send(raw({ tags: ['ok', 'bad\ntag'] }));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/tags items cannot contain line breaks/);
    });

    it('rejects a carriage return in a deliverable sourceType', async () => {
        const res = await agent.post('/api/sessions').send({
            mode: 'deliverable', folder: 'personas', title: 'CR test', slug: 'cr-test', sourceType: 'native\r',
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/sourceType must be one of/);
    });

    it('still allows newlines in methodLabel and description', async () => {
        const rawRes = await agent.post('/api/sessions').send(raw({
            topicSlug: 'multiline-method-label', methodLabel: 'Line one\nLine two',
        }));
        expect(rawRes.status).toBe(201);

        const delRes = await agent.post('/api/sessions').send({
            mode: 'deliverable', folder: 'personas', title: 'Multiline description',
            slug: 'multiline-description', description: 'First line.\nSecond line.',
        });
        expect(delRes.status).toBe(201);
    });

    it('rejects a newline in a PUT title', async () => {
        const res = await agent.put(`/api/records/${recordId}`).send({ frontmatter: { title: 'x\nstatus: final' } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/frontmatter.title cannot contain line breaks/);
    });

    it('rejects a newline in an unknown PUT key', async () => {
        const res = await agent.put(`/api/records/${recordId}`).send({ frontmatter: { scope: 'a\nb' } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/frontmatter.scope cannot contain line breaks/);
    });

    it('rejects frontmatter keys that are not snake_case, including __proto__', async () => {
        // Raw JSON, since a JS object literal's __proto__ sets the prototype
        // instead of creating a key.
        const protoRes = await agent.put(`/api/records/${recordId}`)
            .set('Content-Type', 'application/json')
            .send('{"frontmatter": {"__proto__": {"x": "y"}}}');
        expect(protoRes.status).toBe(400);
        expect(protoRes.body.error).toMatch(/must be snake_case/);

        const spaceRes = await agent.put(`/api/records/${recordId}`).send({ frontmatter: { 'bad key': 'x' } });
        expect(spaceRes.status).toBe(400);
        expect(spaceRes.body.error).toMatch(/must be snake_case/);
    });

    it('still allows newlines in PUT content', async () => {
        const res = await agent.put(`/api/records/${recordId}`).send({ content: '# Heading\n\nParagraph.\n' });
        expect(res.status).toBe(200);
    });
});
