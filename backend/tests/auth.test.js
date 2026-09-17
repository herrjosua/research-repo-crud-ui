const request = require('supertest');
const { app, sessionDb, clearSessionInterval } = require('../app');
const db = require('../db');
const { seedDemoUsers } = require('../seedDemoUsers');

delete process.env.DEMO_MODE; // reset to the "off" baseline every test in this file assumes, regardless of what backend/.env currently has

// Runs before every single test in this file, in every describe block below.
// Wipes the users table so no test can collide with data another test left
// behind. Safe to do here because NODE_ENV=test (set automatically by Jest)
// means db.js is pointed at app.test.db, never your real app.db.
beforeEach(() => {
    db.prepare('DELETE FROM users').run();
});

afterAll(() => {
    db.close();
    sessionDb.close();
    clearSessionInterval();
});

describe('POST /api/auth/signup', () => {
    const validUser = {
        username: 'alice',
        password: 'correct-horse-battery-staple',
        gitName: 'Alice Example',
        gitEmail: 'alice@example.com',
    };

    it('creates a user and starts a session', async () => {
        const res = await request(app).post('/api/auth/signup').send(validUser);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ username: 'alice' });
        expect(res.body.id).toEqual(expect.any(Number));
        expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects a signup missing required fields', async () => {
        const res = await request(app).post('/api/auth/signup').send({ username: 'bob' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/);
    });

    it('rejects a password under 8 characters', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser, password: 'short' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/8 characters/);
    });

    it('rejects a duplicate username', async () => {
        await request(app).post('/api/auth/signup').send(validUser);
        const res = await request(app).post('/api/auth/signup').send(validUser);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already taken/);
    });
});

describe('POST /api/auth/login', () => {
    const credentials = {
        username: 'carol',
        password: 'a-real-password-123',
        gitName: 'Carol Example',
        gitEmail: 'carol@example.com',
    };

    beforeEach(async () => {
        await request(app).post('/api/auth/signup').send(credentials);
    });

    it('logs in with correct credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: credentials.username, password: credentials.password });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ username: 'carol' });
        expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects an unknown username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'nobody', password: 'whatever123' });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid username or password/);
    });

    it('rejects an incorrect password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: credentials.username, password: 'wrong-password' });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid username or password/);
    });

    it('rejects a login missing required fields', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: credentials.username });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/);
    });
});

describe('POST /api/auth/login rate limiting', () => {
    async function signUpUser(username) {
        await request(app).post('/api/auth/signup').send({
            username,
            password: 'a-real-password-123',
            gitName: 'Dave Example',
            gitEmail: 'dave@example.com',
        });
    }

    it('blocks the 6th failed attempt within the window', async () => {
        const username = 'dave-ratelimit-1';
        await signUpUser(username);

        for (let i = 0; i < 5; i += 1) {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ username, password: 'wrong-password' });
            expect(res.status).toBe(401);
        }

        const sixth = await request(app)
            .post('/api/auth/login')
            .send({ username, password: 'wrong-password' });

        expect(sixth.status).toBe(429);
        expect(sixth.body.error).toMatch(/too many failed attempts/);
    });

    it('blocks the 6th attempt even with the correct password', async () => {
        const username = 'dave-ratelimit-2';
        await signUpUser(username);

        for (let i = 0; i < 5; i += 1) {
            await request(app)
                .post('/api/auth/login')
                .send({ username, password: 'wrong-password' });
        }

        const sixth = await request(app)
            .post('/api/auth/login')
            .send({ username, password: 'a-real-password-123' });

        expect(sixth.status).toBe(429);
    });
});

describe('POST /api/auth/logout and GET /api/auth/me', () => {
    const credentials = {
        username: 'erin',
        password: 'a-real-password-123',
        gitName: 'Erin Example',
        gitEmail: 'erin@example.com',
    };

    it('returns 401 from /me when not logged in', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    it('returns the current user from /me after login, then 401 after logout', async () => {
        const agent = request.agent(app);

        await agent.post('/api/auth/signup').send(credentials);

        const meRes = await agent.get('/api/auth/me');
        expect(meRes.status).toBe(200);
        expect(meRes.body).toMatchObject({
            username: 'erin',
            git_name: 'Erin Example',
            git_email: 'erin@example.com',
        });

        const logoutRes = await agent.post('/api/auth/logout');
        expect(logoutRes.status).toBe(204);

        const meAfterLogout = await agent.get('/api/auth/me');
        expect(meAfterLogout.status).toBe(401);
    });

    describe('demo mode', () => {
        afterEach(() => {
            delete process.env.DEMO_MODE;
        });

        describe('GET /api/auth/demo-users', () => {
            it('returns an empty array when DEMO_MODE is not set', async () => {
                const res = await request(app).get('/api/auth/demo-users');
                expect(res.status).toBe(200);
                expect(res.body).toEqual([]);
            });

            it('returns the three demo identities when DEMO_MODE is true', async () => {
                process.env.DEMO_MODE = 'true';
                const res = await request(app).get('/api/auth/demo-users');

                expect(res.status).toBe(200);
                expect(res.body).toHaveLength(3);
                expect(res.body.map((u) => u.username).sort()).toEqual(['jordan', 'priya', 'sam']);
                expect(res.body[0]).toMatchObject({
                    username: expect.any(String),
                    displayName: expect.any(String),
                    role: expect.any(String),
                });
            });
        });

        describe('POST /api/auth/demo-login', () => {
            beforeEach(async () => {
                process.env.DEMO_MODE = 'true';
                await seedDemoUsers();
            });

            it('logs in as each of the three demo users', async () => {
                for (const username of ['priya', 'sam', 'jordan']) {
                    const agent = request.agent(app);
                    const res = await agent.post('/api/auth/demo-login').send({ username });

                    expect(res.status).toBe(200);
                    expect(res.body.username).toBe(username);

                    const meRes = await agent.get('/api/auth/me');
                    expect(meRes.status).toBe(200);
                    expect(meRes.body.username).toBe(username);
                }
            });

            it('rejects a username not on the demo allowlist', async () => {
                const res = await request(app).post('/api/auth/demo-login').send({ username: 'alice' });
                expect(res.status).toBe(400);
                expect(res.body.error).toMatch(/unknown demo user/);
            });

            it('returns 404 when DEMO_MODE is not set', async () => {
                delete process.env.DEMO_MODE;
                const res = await request(app).post('/api/auth/demo-login').send({ username: 'priya' });
                expect(res.status).toBe(404);
            });
        });

        describe('DEMO_MODE interaction with existing routes', () => {
            it('rejects signup with 403 when DEMO_MODE is true', async () => {
                process.env.DEMO_MODE = 'true';
                const res = await request(app).post('/api/auth/signup').send({
                    username: 'newuser',
                    password: 'a-real-password-123',
                    gitName: 'New User',
                    gitEmail: 'newuser@example.com',
                });
                expect(res.status).toBe(403);
            });

            it('rejects a demo username via regular /login when DEMO_MODE is true', async () => {
                process.env.DEMO_MODE = 'true';
                await seedDemoUsers();
                const res = await request(app).post('/api/auth/login').send({ username: 'priya', password: 'whatever' });
                expect(res.status).toBe(403);
                expect(res.body.error).toMatch(/demo login/);
            });
        });
    });
});