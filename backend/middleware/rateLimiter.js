const buckets = new Map();

function rateLimiter({ windowMs, max, keyFn }) {
    return (req, res, next) => {
        const key = keyFn(req);
        const now = Date.now();
        const recent = (buckets.get(key) || []).filter(ts => now - ts < windowMs);

        if (recent.length >= max) {
            return res.status(429).json({ error: 'too many requests, please try again later' });
        }

        recent.push(now);
        buckets.set(key, recent);
        next();
    };
}

// Test-only escape hatch: buckets is module-level state shared by every
// rateLimiter() instance and every request in the process — a test that
// exercises a write route enough times to trigger a 429 permanently spends
// down that same budget for every other test still to run in this file
// (they all hit the app from the same IP via supertest). Clearing it lets a
// rate-limit test start from a known-empty state instead of depending on
// what ran before it.
function _resetForTests() {
    buckets.clear();
}

module.exports = rateLimiter;
module.exports._resetForTests = _resetForTests;
