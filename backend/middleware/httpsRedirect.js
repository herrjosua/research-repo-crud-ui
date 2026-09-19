// Redirects any HTTP request to HTTPS when running in production and the
// proxy's X-Forwarded-Proto header confirms the original request wasn't
// already HTTPS. Pulled out of app.js into its own module, taking
// isProduction as a parameter, so it can be unit-tested directly with plain
// mock req/res/next objects — reloading app.js itself under
// NODE_ENV=production to test this would also flip its isTest flag and
// point sessionDb at the real dev app.db file instead of a scoped test
// database.
function httpsRedirect(isProduction) {
    return (req, res, next) => {
        if (isProduction && req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    };
}

module.exports = httpsRedirect;