const http = require('http');
const supertest = require('supertest');

// Test servers listen on 127.0.0.1 explicitly, never on "all addresses".
//
// supertest's own `request(app)` and Express's `app.listen(0)` both bind the
// wildcard address, and the tests then connect to 127.0.0.1:<port>. On macOS a
// wildcard listener and a listener bound to one specific address can hold the
// same port at once, and a connection to 127.0.0.1:<port> goes to the specific
// one. So whenever the OS handed a test server a port that another program on
// the machine already held on 127.0.0.1 (IntelliJ's built-in servers, Ollama's
// model runners, and so on), the test's request was answered by that program:
// a 404 or 503 from a server the test never started (RR-131). A listener bound
// to 127.0.0.1 itself can't be given a port that is already taken there.

/** Starts `app` on 127.0.0.1 and a free port; resolves to the listening server. */
function listenOnLoopback(app) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve(server);
        });
    });
}

/**
 * For a test that builds a bare Express app and sends it a request or two.
 * Starts the app on 127.0.0.1, runs `makeRequest(request)` where `request` is
 * a supertest agent pointed at it (`(r) => r.get('/ok').set(...)`), returns
 * the response, and always shuts the server down afterwards.
 */
async function viaLoopback(app, makeRequest) {
    const server = await listenOnLoopback(app);
    try {
        return await makeRequest(supertest(`http://127.0.0.1:${server.address().port}`));
    } finally {
        await new Promise((resolve) => {
            server.close(resolve);
            server.closeAllConnections();
        });
    }
}

module.exports = { listenOnLoopback, viaLoopback };
