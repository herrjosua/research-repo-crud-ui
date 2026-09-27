// Rejects any request without a logged-in session. Shared by every /api
// router that serves repo content (records.js, ask.js).
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'not logged in' });
    }
    next();
}

module.exports = requireAuth;
