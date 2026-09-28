const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { SAFE_SLUG_RE } = require('../validation');
const { resolveProvider } = require('../ask/config');
const { createOllamaClient, OllamaError, OLLAMA_DEFAULTS } = require('../ask/ollama');
const { loadRecords } = require('../ask/corpus');
const { createEmbeddingIndex, rankPassages } = require('../ask/retrieval');
const { buildMessages, renumberCitations, toSource } = require('../ask/answer');
const { toPlainText } = require('../ask/plainText');
const { readProjectList, recordProjectTag } = require('../projects');

// ---------------------------------------------------------------------------
// POST /api/ask — Ask the Repo's RAG endpoint (local Ollama only).
//
// Request body:
//   {
//     question: string,          // required, 1–2000 chars after trimming
//     project?: string | null,   // optional; omitted, null, or "all" = whole repo.
//                                // Otherwise a tag slug (^[a-z0-9-]+$): only
//                                // records carrying that tag are searched.
//   }
//
// 200 response:
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
// 503 LLM_PROVIDER not set, 502 Ollama unreachable or failed, 500 anything else.
// ---------------------------------------------------------------------------

const MAX_QUESTION_CHARS = 2000;
// Records handed to the model per question. Six best-matching passages (one
// per record) is ~3–4k characters of context: enough to synthesize across
// sessions, small enough for a 9B model to stay grounded.
const TOP_K = 6;
// Low temperature: this is retrieval-grounded summarization, not writing.
const CHAT_OPTIONS = { temperature: 0.2, num_ctx: 8192 };

const provider = resolveProvider(process.env);

const ollama = provider === 'ollama'
  ? createOllamaClient({
    baseUrl: process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl,
    embedModel: process.env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel,
    chatModel: process.env.OLLAMA_CHAT_MODEL || OLLAMA_DEFAULTS.chatModel,
  })
  : null;

const index = ollama ? createEmbeddingIndex({ embed: ollama.embed, loadRecords }) : null;

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
//     enabled: boolean,  // true only when LLM_PROVIDER is set (to "ollama")
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
  res.json({ enabled: Boolean(provider), projects });
});

router.post('/', async (req, res) => {
  if (!provider) {
    return res.status(503).json({ error: 'ask the repo is not enabled on this server' });
  }

  const inputError = validateAsk(req.body);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const question = req.body.question.trim();
  const project = req.body.project && req.body.project !== 'all' ? req.body.project : null;

  try {
    const { passages } = await index.refresh();
    const inScope = project
      ? passages.filter(({ record }) => Array.isArray(record.tags) && record.tags.includes(project))
      : passages;

    if (inScope.length === 0) {
      return res.json({
        answer: `No records in the repo are tagged "${project}", so there's nothing to answer from.`,
        sources: [],
        model: ollama.chatModel,
      });
    }

    const ranked = rankPassages(await index.embedQuery(question), inScope, TOP_K);
    const raw = await ollama.chat(buildMessages(question, ranked), CHAT_OPTIONS);
    const { text, cited } = renumberCitations(toPlainText(raw), ranked.length);

    res.json({
      answer: text || "The model didn't return an answer. Try rephrasing the question.",
      sources: cited.map((i) => toSource(ranked[i], project)),
      model: ollama.chatModel,
    });
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
