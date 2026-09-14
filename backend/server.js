require('dotenv').config();

const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);

const db = require('./db'); // ensures users table exists
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to your .env file.');
}

// Separate SQLite connection for sessions (same file is fine — better-sqlite3
// handles concurrent connections to one file via WAL mode, set in db.js).
const sessionDb = new Database('app.db');

app.use(express.json());

app.use(session({
  store: new SqliteStore({
    client: sessionDb,
    expired: {
      clear: true,
      intervalMs: 15 * 60 * 1000, // sweep expired sessions every 15 min
    },
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction, // requires HTTPS in production
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use('/api/auth', authRoutes);

// No content endpoints yet — v0.6 scope is auth only.

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
