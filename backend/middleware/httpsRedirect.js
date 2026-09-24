// Redirects plain-HTTP requests to HTTPS. Uses req.secure, which Express
// derives from X-Forwarded-Proto only when the proxy it came from is trusted
// (see proxyTrust.js). Runs after hostCheck, so the Host it redirects to is
// one this app owns. Takes `enabled` as a parameter so it can be unit-tested
// with plain mock objects, without reloading app.js under NODE_ENV=production.
function httpsRedirect(enabled) {
    return (req, res, next) => {
        if (enabled && !req.secure) {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    };
}

// On in production unless HTTPS_REDIRECT=false (e.g. while Cloudflare's edge
// enforces HTTPS and its SSL mode isn't yet Full (strict)); never outside it.
function isHttpsRedirectEnabled(env) {
    return env.NODE_ENV === 'production' && env.HTTPS_REDIRECT !== 'false';
}

module.exports = httpsRedirect;
module.exports.isHttpsRedirectEnabled = isHttpsRedirectEnabled;
