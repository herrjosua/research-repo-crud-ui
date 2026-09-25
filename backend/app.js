const path = require('path');

// Resolved against this file, not the working directory, which the host's
// process manager may set to somewhere else.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const Database = require('better-sqlite3');
const SqliteStore = require('better-sqlite3-session-store')(session);

// better-sqlite3-session-store has a bug: passing `expired: { clear: false }`
// doesn't actually disable its cleanup interval (its constructor does
// `clear || true`, which discards an explicit `false`). Since there's no way
// to stop it through the library's own options, and it never exposes the
// interval it creates, we capture the interval ID ourselves by temporarily
// overriding its prototype method — this doesn't change the library's normal
// behavior in dev/production, it only lets us grab a handle we can cancel
// during tests.
let capturedIntervalId = null;
const originalStartInterval = SqliteStore.prototype.startInterval;
SqliteStore.prototype.startInterval = function patchedStartInterval() {
    capturedIntervalId = setInterval(
        this.clearExpiredSessions.bind(this),
        this.expired.intervalMs
    );
};

const db = require('./db'); // ensures users table exists
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const recordRoutes = require('./routes/records');
const httpsRedirect = require('./middleware/httpsRedirect');
const hostCheck = require('./middleware/hostCheck');
const { trustProxySetting } = require('./proxyTrust');
const { mountFrontend } = require('./frontend');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet());

// Only answer for the configured hostname(s) (ALLOWED_HOSTS; off when unset).
// First, so nothing below acts on a Host this app doesn't own.
app.use(hostCheck(hostCheck.parseAllowedHosts(process.env.ALLOWED_HOSTS)));

// In production the app sits behind Cloudflare and the host's proxy. Trust
// exactly those hops (see proxyTrust.js) so req.ip is the visitor and
// req.secure reflects the visitor's original HTTPS connection, which the
// `secure` session cookie below depends on.
if (isProduction) {
    app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));
}

// Redirect plain HTTP to HTTPS: production only, and switchable off with
// HTTPS_REDIRECT=false (see .env.production.example for when).
app.use(httpsRedirect(httpsRedirect.isHttpsRedirectEnabled(process.env)));

if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not set. Add it to your .env file.');
}

// Separate SQLite connection for sessions (same file is fine — better-sqlite3
// handles concurrent connections to one file via WAL mode, set in db.js).
const isTest = process.env.NODE_ENV === 'test';
const sessionDb = new Database(path.join(__dirname, isTest ? `app.test.${process.env.JEST_WORKER_ID || 0}.db` : 'app.db'));

app.use(express.json());

app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /');
});

app.use(session({
    store: new SqliteStore({
        client: sessionDb,
        expired: {
            clear: true, // this option is genuinely broken in the library — always true regardless of what's passed; the real gate is clearSessionInterval() below
            intervalMs: 15 * 60 * 1000,
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

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', recordRoutes);

// Unmatched /api paths get a JSON 404, never the frontend's index.html below.
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not found' });
});

// The built frontend, served by this same process. FRONTEND_DIST overrides
// where it is; production defaults to frontend/dist and refuses to start
// without it. Dev and test don't serve it (Vite serves the frontend in dev).
const frontendDist = process.env.FRONTEND_DIST
    || (isProduction ? path.join(__dirname, '..', 'frontend', 'dist') : null);
if (frontendDist) {
    mountFrontend(app, frontendDist);
}

// Without this, any error passed to next() (e.g. body-parser's
// PayloadTooLargeError on an oversized request, or a SyntaxError on
// malformed JSON) falls through to Express's built-in finalhandler, which
// renders a full stack trace — including absolute filesystem paths and
// node_modules internals — in the response body whenever NODE_ENV isn't
// exactly "production". That's a real information leak in dev/test and on
// any deploy that forgets to set NODE_ENV, so respond generically here
// instead of relying on that env check.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || err.statusCode || 500;
    const message = status === 413 ? 'request entity too large'
        : status < 500 ? 'malformed request'
        : 'internal server error';
    res.status(status).json({ error: message });
});

function clearSessionInterval() {
    if (capturedIntervalId) clearInterval(capturedIntervalId);
}

module.exports = { app, sessionDb, clearSessionInterval };
