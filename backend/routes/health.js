const express = require('express');
const db = require('../db');
const { version } = require('../package.json');

// When this process loaded the app. scripts/deploy.sh compares it with the
// moment it sent SIGTERM, so a 200 from the old process (a restart that never
// happened) can't pass for the new one.
const startedAt = new Date().toISOString();

const router = express.Router();

// GET /api/health — public, unauthenticated. 200 means the process is up and
// the database answers; `version` (backend/package.json) tells the deploy
// script which release is live. Never cached: it's fetched through
// Cloudflare. Deliberately leaves out the pid and anything else about the
// host.
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    db.prepare('SELECT 1').get();
  } catch {
    return res.status(503).json({ status: 'error', version, startedAt });
  }
  res.json({ status: 'ok', version, startedAt });
});

module.exports = router;
