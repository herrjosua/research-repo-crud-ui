// Rejects requests whose Host header isn't one of ALLOWED_HOSTS (comma
// separated; port ignored, case-insensitive). Off when the list is empty.
//
// Host is client-controlled, so this is not access control: anyone can send
// the right Host with curl. It stops the app acting on a Host it doesn't own:
// the HTTPS redirect below builds its Location from Host, DNS-rebinding pages
// send their own hostname, and scanners hitting the bare IP get turned away.
// Reads the raw header, not req.hostname, which would honor X-Forwarded-Host.
function parseAllowedHosts(value) {
    return (value || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

function hostCheck(allowedHosts) {
    const allowed = new Set(allowedHosts);
    return (req, res, next) => {
        if (allowed.size === 0) return next();
        const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
        if (!allowed.has(host)) {
            return res.status(421).json({ error: 'misdirected request' });
        }
        next();
    };
}

module.exports = hostCheck;
module.exports.parseAllowedHosts = parseAllowedHosts;
