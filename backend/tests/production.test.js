const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const hostCheck = require('../middleware/hostCheck');
const httpsRedirect = require('../middleware/httpsRedirect');
const { trustProxySetting } = require('../proxyTrust');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

// Production serving: host check, proxy trust, the HTTPS redirect switch, and
// the built frontend served from the same process as the API.

describe('host check', () => {
    function appWithHostCheck(allowed) {
        const app = express();
        app.use(hostCheck(hostCheck.parseAllowedHosts(allowed)));
        app.get('/ok', (req, res) => res.send('ok'));
        return app;
    }

    it('accepts an allowed host with or without a port, in any case', async () => {
        const app = appWithHostCheck('ux-research.joshuabock.com');
        expect((await request(app).get('/ok').set('Host', 'ux-research.joshuabock.com')).status).toBe(200);
        expect((await request(app).get('/ok').set('Host', 'UX-Research.JoshuaBock.com:26851')).status).toBe(200);
    });

    it('rejects any other host with 421', async () => {
        const app = appWithHostCheck('ux-research.joshuabock.com');
        const res = await request(app).get('/ok').set('Host', 'evil.example');
        expect(res.status).toBe(421);
        expect(res.body).toEqual({ error: 'misdirected request' });
    });

    it('is off when ALLOWED_HOSTS is unset', async () => {
        const app = appWithHostCheck(undefined);
        expect((await request(app).get('/ok').set('Host', 'anything.example')).status).toBe(200);
    });

    it('stops a forged Host before the HTTPS redirect can send a visitor to it', async () => {
        const app = express();
        app.use(hostCheck(['ux-research.joshuabock.com']));
        app.use(httpsRedirect(true));
        const res = await request(app).get('/').set('Host', 'evil.example');
        expect(res.status).toBe(421);
        expect(res.headers.location).toBeUndefined();
    });
});

describe('proxy trust', () => {
    // supertest connects from loopback, standing in for the host's proxy.
    function appTrusting(trustProxyEnv) {
        const app = express();
        app.set('trust proxy', trustProxySetting(trustProxyEnv));
        app.get('/whoami', (req, res) => res.json({ ip: req.ip, secure: req.secure }));
        return app;
    }

    it('sees the visitor through Cloudflare and the host proxy', async () => {
        const res = await request(appTrusting(undefined))
            .get('/whoami')
            .set('X-Forwarded-For', '198.51.100.7, 173.245.48.1')
            .set('X-Forwarded-Proto', 'https');
        expect(res.body).toEqual({ ip: '198.51.100.7', secure: true });
    });

    it('ignores a forged X-Forwarded-For on a request that skipped Cloudflare', async () => {
        // Direct to the host: the host proxy appends the real peer (not a
        // Cloudflare address) after whatever the client claimed.
        const res = await request(appTrusting(undefined))
            .get('/whoami')
            .set('X-Forwarded-For', '6.6.6.6, 203.0.113.9');
        expect(res.body.ip).toBe('203.0.113.9');
    });

    it('ignores X-Forwarded-Proto from a proxy that is not trusted', async () => {
        const res = await request(appTrusting('10.0.0.1'))
            .get('/whoami')
            .set('X-Forwarded-For', '198.51.100.7')
            .set('X-Forwarded-Proto', 'https');
        expect(res.body.secure).toBe(false);
        expect(res.body.ip).not.toBe('198.51.100.7');
    });
});

describe('HTTPS redirect switch', () => {
    it('is on in production unless HTTPS_REDIRECT=false, and never outside production', () => {
        const { isHttpsRedirectEnabled } = httpsRedirect;
        expect(isHttpsRedirectEnabled({ NODE_ENV: 'production' })).toBe(true);
        expect(isHttpsRedirectEnabled({ NODE_ENV: 'production', HTTPS_REDIRECT: 'true' })).toBe(true);
        expect(isHttpsRedirectEnabled({ NODE_ENV: 'production', HTTPS_REDIRECT: 'false' })).toBe(false);
        expect(isHttpsRedirectEnabled({ NODE_ENV: 'development' })).toBe(false);
        expect(isHttpsRedirectEnabled({ NODE_ENV: 'test', HTTPS_REDIRECT: 'true' })).toBe(false);
    });
});

describe('built frontend served by the app', () => {
    let testRepoPath, distDir;
    let app, sessionDb, clearSessionInterval, db, server, agent;

    const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';

    beforeAll(async () => {
        testRepoPath = createTestRepo();
        process.env.AGENTIC_REPO_ROOT = testRepoPath;

        distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-dist-'));
        fs.mkdirSync(path.join(distDir, 'assets'));
        fs.writeFileSync(path.join(distDir, 'index.html'), INDEX_HTML);
        fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log("app");');
        process.env.FRONTEND_DIST = distDir;

        ({ app, sessionDb, clearSessionInterval } = require('../app'));
        db = require('../db');
        server = app.listen(0);
        delete process.env.DEMO_MODE; // same "off" baseline as the other test files, whatever backend/.env says

        db.prepare('DELETE FROM users WHERE username = ?').run('production-tester');
        agent = request.agent(server);
        const signupRes = await agent.post('/api/auth/signup').send({
            username: 'production-tester',
            password: 'a-real-password-123',
            gitName: 'Production Tester',
            gitEmail: 'production-tester@example.com',
        });
        if (signupRes.status !== 201) throw new Error(`signup failed: ${JSON.stringify(signupRes.body)}`);
    });

    afterAll(async () => {
        db.close();
        sessionDb.close();
        clearSessionInterval();
        server.close();
        delete process.env.FRONTEND_DIST;
        delete process.env.AGENTIC_REPO_ROOT;
        await destroyTestRepo(testRepoPath);
        fs.rmSync(distDir, { recursive: true, force: true });
    });

    it('serves hashed assets with a long immutable cache', async () => {
        const res = await agent.get('/assets/index-abc123.js');
        expect(res.status).toBe(200);
        expect(res.text).toBe('console.log("app");');
        expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('answers a client-side route with index.html, revalidated every time', async () => {
        const res = await agent.get('/records/some-id').set('Accept', 'text/html');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toBe(INDEX_HTML);
        expect(res.headers['cache-control']).toBe('no-cache');
    });

    it('answers an unknown /api path with JSON 404, not index.html', async () => {
        const res = await agent.get('/api/nope').set('Accept', 'text/html');
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual({ error: 'not found' });
    });

    it('still serves robots.txt', async () => {
        const res = await agent.get('/robots.txt');
        expect(res.status).toBe(200);
        expect(res.text).toBe('User-agent: *\nDisallow: /');
    });

    it('does not answer non-GET requests with index.html', async () => {
        const res = await agent.post('/records/some-id').set('Accept', 'text/html');
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('<div id="root">');
    });

    it('sends helmet\'s Content-Security-Policy with the app shell', async () => {
        const res = await agent.get('/').set('Accept', 'text/html');
        expect(res.status).toBe(200);
        expect(res.headers['content-security-policy']).toMatch(/script-src 'self'/);
    });
});
