// Whether this server registers its dev-only routes (routes/dev.js, under
// /api/dev). Decided once, when app.js builds the app: the routes are either
// mounted or they don't exist, so there's no runtime permission check to get
// wrong. Fails closed: DEV_TOOLS_ENABLED must be exactly "true" AND NODE_ENV
// must be development or test. Production, or a deploy that forgot to set
// NODE_ENV at all, never gets them, whatever the flag says.
const DEV_TOOLS_NODE_ENVS = new Set(['development', 'test']);

// `{ enabled, reason }`. `reason` says why the flag was refused when it was
// set but the gate still said no (app.js logs it), and is null otherwise.
function devToolsGate(env) {
    if (env.DEV_TOOLS_ENABLED !== 'true') return { enabled: false, reason: null };
    if (!DEV_TOOLS_NODE_ENVS.has(env.NODE_ENV)) {
        const nodeEnv = env.NODE_ENV === undefined ? 'unset' : JSON.stringify(env.NODE_ENV);
        return {
            enabled: false,
            reason: `DEV_TOOLS_ENABLED=true is ignored: NODE_ENV is ${nodeEnv}, not "development" or "test". The /api/dev routes are not registered.`,
        };
    }
    return { enabled: true, reason: null };
}

// What app.js calls: mounts routes/dev.js at /api/dev when the gate allows
// it, and otherwise logs why a set flag was refused. The router is required
// only when mounted, so a production process never loads it. Returns
// whether it mounted.
function mountDevTools(app, env, { warn = console.warn } = {}) {
    const { enabled, reason } = devToolsGate(env);
    if (enabled) {
        app.use('/api/dev', require('./routes/dev'));
    } else if (reason) {
        warn(`[dev tools] ${reason}`);
    }
    return enabled;
}

module.exports = { devToolsGate, mountDevTools, DEV_TOOLS_NODE_ENVS };
