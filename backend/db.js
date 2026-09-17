const Database = require('better-sqlite3');
const path = require('path');

const isTest = process.env.NODE_ENV === 'test';
const dbFile = isTest ? `app.test.${process.env.JEST_WORKER_ID || 0}.db` : 'app.db';

const db = new Database(path.join(__dirname, dbFile));

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT UNIQUE NOT NULL,
      git_name TEXT NOT NULL,
      git_email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
`);

module.exports = db;