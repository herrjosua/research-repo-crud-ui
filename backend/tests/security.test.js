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
let request, db, agent;

beforeAll(async () => {
    testRepoPath = createTestRepo();
    process.env.AGENTIC_REPO_ROOT = testRepoPath;

    request = require('supertest');
    ({ app, sessionDb, clearSessionInterval } = require('../app'));
    db = require('../db');
    delete process.env.DEMO_MODE;

    db.prepare('DELETE FROM users WHERE username = ?').run('security-tester');

    agent = request.agent(app);
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
        const res = await request(app).post('/api/auth/login').send({
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

        const res = await request(app).post('/api/auth/signup').send({
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
        await request(app).post('/api/auth/login').send({
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
        const res = await request(app).post('/api/auth/login').send({ username: 'x', password: oversized });
        expect(res.status).toBe(413);
    });

    it('does not leak a stack trace or filesystem paths for an oversized body', async () => {
        const oversized = 'a'.repeat(200 * 1024);
        const res = await request(app).post('/api/auth/login').send({ username: 'x', password: oversized });

        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.text).not.toMatch(/node_modules/);
        expect(res.text).not.toMatch(/\.js:\d+:\d+/); // "file.js:12:34"-style stack frames
        expect(res.text).not.toMatch(/at\s+\S+\s+\(/); // "at functionName (" stack frames
    });

    it('does not leak a stack trace for a malformed (truncated) JSON body either', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"username": "x", "password": ');

        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.text).not.toMatch(/node_modules/);
    });

    it('accepts a normal-sized body as before', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'whatever' });
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
        const res = await request(app).get('/api/records').set('Cookie', cookie);

        expect(res.status).toBe(401);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual({ error: 'not logged in' });
        expect(res.text).not.toMatch(/node_modules|at\s+\S+\s+\(/);
    });

    it('rejects a request with no cookie at all the same way', async () => {
        const res = await request(app).get('/api/records');
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
        const res = await request(app).get('/robots.txt');
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
