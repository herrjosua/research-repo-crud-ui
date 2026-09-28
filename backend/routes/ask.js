const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { SAFE_SLUG_RE } = require('../validation');
const { resolveProvider } = require('../ask/config');
const { createOllamaClient, OllamaError, OLLAMA_DEFAULTS } = require('../ask/ollama');
const { loadRecords } = require('../ask/corpus');
const { createEmbeddingIndex } = require('../ask/retrieval');
const { createAskPipeline } = require('../ask/pipeline');
const { loadStaticAnswers, ANSWERS_FILE } = require('../ask/staticAnswers');
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
// 404 unknown questionId (static), 503 LLM_PROVIDER not set, 502 Ollama
// unreachable or failed, 500 anything else.
// ---------------------------------------------------------------------------

const MAX_QUESTION_CHARS = 2000;

const provider = resolveProvider(process.env);
// GET /api/ask/config's `mode` for each provider.
const MODES = { ollama: 'live', static: 'static' };

// Live mode only. Static mode never builds a client, so it can't reach Ollama.
const ollama = provider === 'ollama'
  ? createOllamaClient({
    baseUrl: process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl,
    embedModel: process.env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
    chatModel: process.env.OLLAMA_CHAT_MODEL || OLLAMA_DEFAULTS.chatModel,
  })
  : null;

const pipeline = ollama
  ? createAskPipeline({ ollama, index: createEmbeddingIndex({ embed: ollama.embed, loadRecords }) })
  : null;

// Static mode only: read and validated once, at startup, so a missing or
// broken file stops the server instead of failing each request. Live mode
// and a disabled Ask never read it, so they start without it.
//
// ASK_STATIC_ANSWERS_FILE is test-only: under NODE_ENV=test (set by Jest) it
// points at a fixture instead. Everywhere else it's ignored, so a deployed
// server always serves the checked-in file.
const answersFile = process.env.NODE_ENV === 'test' && process.env.ASK_STATIC_ANSWERS_FILE
  ? process.env.ASK_STATIC_ANSWERS_FILE
  : ANSWERS_FILE;
const staticAnswers = provider === 'static' ? loadStaticAnswers(answersFile) : null;

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
//     enabled: boolean,  // true when LLM_PROVIDER is set ("ollama" or "static")
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
  if (staticAnswers) {
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
  const entry = staticAnswers.byId.get(questionId);
  if (!entry) {
    return res.status(404).json({ error: 'unknown questionId' });
  }
  res.json({ answer: entry.answer, sources: entry.sources, model: staticAnswers.metadata.model });
}

router.post('/', async (req, res) => {
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
    const { answer, sources, model } = await pipeline.ask(question, project);
    res.json({ answer, sources, model });
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
