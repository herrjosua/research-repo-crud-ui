const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { SAFE_SLUG_RE } = require('../validation');
const activeProvider = require('../ask/activeProvider');
const { OllamaError } = require('../ask/ollama');
const { loadRecords } = require('../ask/corpus');
const { readProjectList, recordProjectTag } = require('../projects');

// ---------------------------------------------------------------------------
// POST /api/ask — Ask the Repo's RAG endpoint (local Ollama), or with
// LLM_PROVIDER=static, the public demo's captured answers.
//
// Request body (LLM_PROVIDER=ollama):
//   {
//     question: string,          // required, 1–2000 chars after trimming
//     project?: string | null,   // optional; omitted, null, or "all" = whole repo.
//                                // Otherwise a tag slug (^[a-z0-9-]+$): only
//                                // records carrying that tag are searched.
//   }
//
// Request body (LLM_PROVIDER=static):
//   {
//     questionId: string,        // required: an id from GET /api/ask/config's
//                                // `questions`. There is no model, so a free-text
//                                // `question` is rejected (400) and an unknown
//                                // id is 404. Any `project` is ignored: each
//                                // captured question already has its own.
//   }
//
// 200 response (both providers; in static mode, the captured answer verbatim):
//   {
//     answer: string,     // plain text (see ask/plainText.js). Paragraphs are
//                         // separated by "\n\n"; citations are "[n]" markers
//                         // where [n] is sources[n - 1].
//     sources: Source[],  // only the sources the answer cites, in [1], [2], …
//                         // order; [] when the answer cites nothing.
//     model: string,      // the generating model, e.g. "gemma2:9b"
//     checks: {           // live (ollama) only, never static. Flags on the
//                         // answer from ask/checks.js; the answer is unchanged.
//       retried: false,   // always false for now: nothing is regenerated
//       uncited: string[],            // sentences needing a citation that have none
//       unsupportedFigures: string[], // figures / "N of M" counts not in their
//                                     // sentence's cited sources (title, section
//                                     // or excerpt), once per sentence
//       stacked: string[],            // sentences citing 3+ distinct sources
//     },
//   }
//
//   Source — the frontend's mock Source shape
//   (frontend/src/ask-the-repo/mock/messages.js) plus real-record fields:
//   {
//     id: string,                  // "<recordId>#<passage index>", unique per passage
//     kind: 'interview' | 'survey' | 'transcript' | 'synthesis' | 'doc',
//     title: string,               // the record's title
//     excerpt: string,             // the cited passage, verbatim from the record
//     project: string | null,      // the request's project filter, or null
//     recordProject: string | null,// the record's own project-* tag, or null
//     date: string | null,         // "Jan 14, 2025", or null if the record has no date
//     contextBefore: string | null,// text preceding the excerpt in the record (≤ ~400 chars)
//     contextAfter: string | null, // text following it (≤ ~400 chars)
//     section: string | null,      // the heading the excerpt sits under
//     recordId: string,            // e.g. "raw:2025-01-14-…", for GET /api/records/:id
//     recordKind: string,          // raw | finding | component | analytics | deliverable
//     recordType: string | null,   // e.g. "usability-test", "personas"
//     score: number,               // cosine similarity to the question, 0–1
//   }
//   (No `page`: markdown records have no pages. SourceCard already omits it.)
//
// Errors (all `{ error: string }`): 400 bad input, 401 not logged in,
// 404 unknown questionId (static), 503 no provider active (LLM_PROVIDER not set), 502 Ollama
// unreachable or failed, 500 anything else.
// ---------------------------------------------------------------------------

const MAX_QUESTION_CHARS = 2000;

// GET /api/ask/config's `mode` for each provider.
const MODES = { ollama: 'live', static: 'static' };

// The provider is read once per request from ask/activeProvider.js: it
// starts as LLM_PROVIDER and, on a dev server only, can be switched without
// a restart (POST /api/dev/provider, routes/dev.js). Static mode never
// builds an Ollama client, so it can't reach Ollama.

function validateAsk(body) {
  const { question, project } = body || {};
  if (typeof question !== 'string' || !question.trim()) {
    return 'question is required';
  }
  if (question.trim().length > MAX_QUESTION_CHARS) {
    return `question must be at most ${MAX_QUESTION_CHARS} characters`;
  }
  if (project !== undefined && project !== null
      && (typeof project !== 'string' || (project !== 'all' && !SAFE_SLUG_RE.test(project)))) {
    return 'project must be "all" or a tag slug matching ^[a-z0-9-]+$';
  }
  return null;
}

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/ask/config — what the Ask tab needs before anyone asks anything.
// Always 200 for a signed-in user (never 503, unlike POST):
//   {
//     enabled: boolean,  // true when a provider is active: LLM_PROVIDER, or
//                        // on a dev server a switch (routes/dev.js)
//     mode: 'live' | 'static' | null,
//                        // live: POST takes a typed question; static: POST
//                        // takes a questionId from `questions`; null: off
//     questions?: [{ id, question, project }],
//                        // static mode only: the captured questions, in
//                        // curated order. project: the project-* tag the
//                        // question was captured under, or null for all.
//     capture?: { model, capturedAt },
//                        // static mode only: the chat model that produced
//                        // the answers and when (ISO timestamp), from the
//                        // answers file's metadata.
//     projects: [{ id, label, count }],
//                        // id: the full project-* tag POST's `project` filter
//                        // matches; label: from research/projects.yml;
//                        // count: exported records carrying that tag. In
//                        // projects.yml order, project-cross-cutting last;
//                        // [] when the checkout has no projects.yml.
//   }
// ---------------------------------------------------------------------------
router.get('/config', async (req, res) => {
  const provider = activeProvider.get();
  const projectList = readProjectList(process.env.AGENTIC_REPO_ROOT);
  let projects = [];
  if (projectList.length > 0) {
    try {
      const counts = new Map();
      for (const record of await loadRecords({ summary: true })) {
        const tag = recordProjectTag(record);
        if (tag) counts.set(tag, (counts.get(tag) || 0) + 1);
      }
      projects = projectList.map((project) => ({ ...project, count: counts.get(project.id) || 0 }));
    } catch (err) {
      console.error('[GET /api/ask/config] export_records.py failed:', err.message);
      return res.status(500).json({ error: 'internal server error' });
    }
  }
  const body = { enabled: Boolean(provider), mode: MODES[provider] ?? null, projects };
  if (provider === 'static') {
    const staticAnswers = activeProvider.getStaticAnswers();
    body.questions = staticAnswers.questions.map(({ id, question, project }) => ({ id, question, project }));
    const { model, capturedAt } = staticAnswers.metadata;
    body.capture = { model, capturedAt };
  }
  res.json(body);
});

function answerStatic(req, res) {
  const { question, questionId } = req.body || {};
  if (question !== undefined) {
    return res.status(400).json({ error: 'this server only answers its listed questions; send questionId, not question' });
  }
  if (typeof questionId !== 'string' || !questionId) {
    return res.status(400).json({ error: 'questionId is required' });
  }
  const staticAnswers = activeProvider.getStaticAnswers();
  const entry = staticAnswers.byId.get(questionId);
  if (!entry) {
    return res.status(404).json({ error: 'unknown questionId' });
  }
  res.json({ answer: entry.answer, sources: entry.sources, model: staticAnswers.metadata.model });
}

router.post('/', async (req, res) => {
  const provider = activeProvider.get();
  if (!provider) {
    return res.status(503).json({ error: 'ask the repo is not enabled on this server' });
  }
  if (provider === 'static') {
    return answerStatic(req, res);
  }

  const inputError = validateAsk(req.body);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const question = req.body.question.trim();
  const project = req.body.project && req.body.project !== 'all' ? req.body.project : null;

  try {
    const { answer, sources, model, checks } = await activeProvider.getPipeline().ask(question, project);
    res.json({ answer, sources, model, checks });
  } catch (err) {
    if (err instanceof OllamaError) {
      console.error(`[POST /api/ask] ${err.message}: ${err.detail || ''}`);
      return res.status(502).json({ error: 'the local language model is unavailable' });
    }
    console.error('[POST /api/ask] unexpected error:', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = router;
