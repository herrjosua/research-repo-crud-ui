const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

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

// POST /signup
router.post('/signup', async (req, res) => {
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
  const user = db.prepare('SELECT id, username, git_name, git_email FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'not logged in' });
  }
  res.json(user);
});

module.exports = router;
