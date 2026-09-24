const fs = require('fs');
const path = require('path');
const express = require('express');

// Serves the built frontend (vite build output) from the same process as the
// API. Mount after every /api route and robots.txt so none of them can be
// shadowed. Hashed files under assets/ never change, so they're cached for a
// year; index.html is always revalidated so a deploy is picked up.
function mountFrontend(app, distDir) {
    const indexFile = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexFile)) {
        throw new Error(`No built frontend at ${indexFile}. Run "npm run build" in frontend/, or set FRONTEND_DIST.`);
    }

    app.use(express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
            if (filePath.startsWith(path.join(distDir, 'assets') + path.sep)) {
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
            }
        },
    }));

    // SPA fallback: any other page-load GET gets the app shell, so client-side
    // routes survive a refresh. Non-GET requests and non-HTML requests fall
    // through to a 404.
    app.use((req, res, next) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.accepts('html')) return next();
        res.set('Cache-Control', 'no-cache');
        res.sendFile(indexFile);
    });
}

module.exports = { mountFrontend };
