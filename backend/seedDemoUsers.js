const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');
const { DEMO_USERS } = require('./demoUsers');

const SALT_ROUNDS = 12; // matches routes/auth.js's own constant

// Creates each demo user if it doesn't already exist. Idempotent — safe to
// call on every server startup. Each gets a genuinely random password that's
// never surfaced or stored in plaintext anywhere; regular /login is also
// explicitly blocked for these usernames (see routes/auth.js), so the
// password only exists to satisfy the users table's NOT NULL constraint —
// the only real way in is POST /auth/demo-login.
async function seedDemoUsers() {
    for (const user of DEMO_USERS) {
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(user.username);
        if (existing) continue;

        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, SALT_ROUNDS);

        db.prepare(`
      INSERT INTO users (username, password_hash, git_name, git_email, is_lead)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.username, passwordHash, user.gitName, user.gitEmail, user.isLead ? 1 : 0);

        console.log(`Seeded demo user: ${user.username}`);
    }
}

module.exports = { seedDemoUsers };