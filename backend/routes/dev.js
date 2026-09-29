const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const activeProvider = require('../ask/activeProvider');
const { OllamaError } = require('../ask/ollama');

// ---------------------------------------------------------------------------
// /api/dev — dev-only tools. app.js mounts this router only when
// devToolsGate() (devTools.js) allows it: DEV_TOOLS_ENABLED=true and
// NODE_ENV development or test. Anywhere else these paths don't exist and
// answer the JSON 404 like any unknown /api path.
//
// GET /api/dev/provider → { provider: 'static' | 'ollama' | null }
//   The provider Ask the Repo answers with right now. null: off
//   (LLM_PROVIDER unset and not switched since).
//
// POST /api/dev/provider  { provider: 'static' | 'ollama' } → { provider }
//   Switches Ask the Repo's provider for this server process, without a
//   restart; a restart goes back to LLM_PROVIDER. It can turn Ask on when
//   LLM_PROVIDER is unset, but not off again: only these two values are
//   accepted. The new provider is checked before anything changes; if the
//   check fails, the provider stays as it was.
//   400: anything but exactly "static" or "ollama" (including a body that
//        isn't JSON: express.json() only parses application/json, which is
//        also what stops a cross-site form from posting here).
//   502: ollama, but Ollama isn't reachable or lacks a model; `error` says which.
//   500: static, but the answers file is missing or invalid; `error` says why.
// ---------------------------------------------------------------------------

const PROVIDERS = new Set(['static', 'ollama']);

const router = express.Router();
router.use(requireAuth);

router.get('/provider', (req, res) => {
    res.json({ provider: activeProvider.get() });
});

router.post('/provider', async (req, res) => {
    const { provider } = req.body || {};
    if (typeof provider !== 'string' || !PROVIDERS.has(provider)) {
        return res.status(400).json({ error: 'provider must be "static" or "ollama"' });
    }

    if (provider === 'ollama') {
        try {
            await activeProvider.getOllama().checkReady();
        } catch (err) {
            if (!(err instanceof OllamaError)) throw err;
            console.error(`[POST /api/dev/provider] ${err.message}${err.detail ? `: ${err.detail}` : ''}`);
            return res.status(502).json({ error: err.message });
        }
    } else {
        try {
            activeProvider.getStaticAnswers();
        } catch (err) {
            console.error(`[POST /api/dev/provider] ${err.message}`);
            return res.status(500).json({ error: err.message });
        }
    }

    const previous = activeProvider.get();
    activeProvider.set(provider);
    if (previous !== provider) {
        console.log(`[dev] Ask the Repo provider switched from ${previous ?? 'off'} to ${provider}`);
    }
    res.json({ provider });
});

module.exports = router;
