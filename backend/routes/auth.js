const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { DEMO_USERS, DEMO_USERNAMES } = require('../demoUsers');

const router = express.Router();
const SALT_ROUNDS = 12;

// Very small in-memory rate limiter for login attempts.
// Keyed by username; resets on server restart. Good enough for v0.6 scope.
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(username) {
  const entry = loginAttempts.get(username);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(username);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(username) {
  const entry = loginAttempts.get(username);
  if (!entry || Date.now() - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.set(username, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearAttempts(username) {
  loginAttempts.delete(username);
}

// IP-based rate limiter for the passwordless demo-login route below — a
// different shape from the per-username limiter above, since there's no
// password to guess here. The risk is a script mass-creating sessions, not
// credential stuffing, so this limits total requests per IP instead.
const demoLoginAttempts = new Map();
const DEMO_MAX_REQUESTS = 20;
const DEMO_WINDOW_MS = 15 * 60 * 1000;

function isDemoRateLimited(ip) {
  const entry = demoLoginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstRequest > DEMO_WINDOW_MS) {
    demoLoginAttempts.delete(ip);
    return false;
  }
  return entry.count >= DEMO_MAX_REQUESTS;
}

function recordDemoRequest(ip) {
  const entry = demoLoginAttempts.get(ip);
  if (!entry || Date.now() - entry.firstRequest > DEMO_WINDOW_MS) {
    demoLoginAttempts.set(ip, { count: 1, firstRequest: Date.now() });
  } else {
    entry.count += 1;
  }
}

// POST /signup
router.post('/signup', async (req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    return res.status(403).json({ error: 'signup is disabled on this deployment' });
  }

  const { username, password, gitName, gitEmail } = req.body;

  if (!username || !password || !gitName || !gitEmail) {
    return res.status(400).json({ error: 'username, password, gitName, and gitEmail are all required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'username already taken' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, git_name, git_email)
    VALUES (?, ?, ?, ?)
  `).run(username, passwordHash, gitName, gitEmail);

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'session error' });
    req.session.userId = result.lastInsertRowid;
    res.status(201).json({ id: result.lastInsertRowid, username });
  });
});

// POST /login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  if (process.env.DEMO_MODE === 'true' && DEMO_USERNAMES.has(username)) {
    return res.status(403).json({ error: 'use the demo login instead' });
  }

  if (isRateLimited(username)) {
    return res.status(429).json({ error: 'too many failed attempts, try again later' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    recordFailedAttempt(username);
    return res.status(401).json({ error: 'invalid username or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    recordFailedAttempt(username);
    return res.status(401).json({ error: 'invalid username or password' });
  }

  clearAttempts(username);

  // Regenerate session ID on login to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'session error' });
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username });
  });
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'logout failed' });
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

// GET /me
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }
  const user = db.prepare('SELECT id, username, git_name, git_email, is_lead FROM users WHERE id = ?')
      .get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'not logged in' });
  }
  res.json(user);
});

// GET /users — every user's username + git_name, for the lead-reassignment
// dropdown in the create/edit forms. Just names, not sensitive, so any
// logged-in user can call it (no lead-only gate) — reused as-is by both demo
// mode and real signup mode rather than building two separate lookups.
router.get('/users', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }
  const users = db.prepare('SELECT username, git_name FROM users ORDER BY username').all();
  res.json(users);
});

// GET /demo-users — public, unauthenticated. Returns the picker's data when
// DEMO_MODE is on; an empty array otherwise, so the frontend can render the
// existing LoginForm as it always has, with zero special-casing beyond
// "is this list empty or not".
router.get('/demo-users', (req, res) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.json([]);
  }
  res.json(DEMO_USERS.map(({ username, displayName, role }) => ({ username, displayName, role })));
});

// POST /demo-login — passwordless login for exactly the three seeded demo
// identities. Only reachable when DEMO_MODE is on; username is validated
// against the fixed DEMO_USERNAMES allowlist server-side, never trusted
// beyond selecting one of those three — this can never become "log in as
// any username you send me."
router.post('/demo-login', (req, res) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(404).json({ error: 'not found' });
  }

  if (isDemoRateLimited(req.ip)) {
    return res.status(429).json({ error: 'too many requests, try again later' });
  }
  recordDemoRequest(req.ip);

  const { username } = req.body;
  if (!DEMO_USERNAMES.has(username)) {
    return res.status(400).json({ error: 'unknown demo user' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    // DEMO_MODE is on but seeding hasn't run/succeeded — a real operational
    // problem, not a user error.
    return res.status(500).json({ error: 'demo user not seeded' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'session error' });
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username });
  });
});

module.exports = router;