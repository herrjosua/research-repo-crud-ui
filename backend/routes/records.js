const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const matter = require('gray-matter');
const db = require('../db');
const rateLimiter = require('../middleware/rateLimiter');

const execFileAsync = promisify(execFile);
const router = express.Router();

const writeLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: (req) => req.ip,
});

// Path to the agentic-repo checkout. Configurable via env so this isn't hardcoded
// to one machine's layout.
const AGENTIC_REPO_ROOT = process.env.AGENTIC_REPO_ROOT || '/Users/joshuacbock/IdeaProjects/agentic-repo';
const SCRIPTS_DIR = path.join(AGENTIC_REPO_ROOT, 'research', 'scripts');
const RESEARCH_ROOT = path.join(AGENTIC_REPO_ROOT, 'research');

// The Python interpreter to shell out to. Must be the one with python-frontmatter
// installed (the agentic-repo's own venv) — NOT whatever bare "python3" resolves
// to on this machine's PATH, since ServBay shadows that with a broken shim that
// doesn't have this project's dependencies. Set PYTHON_BIN in .env to override.
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

// Passed as the `env` option on every PYTHON_BIN invocation below.
// PYTHONDONTWRITEBYTECODE=1 stops Python from writing .pyc bytecode cache
// files into __pycache__/ inside the venv's shared site-packages. Without
// this, the very first import of a given module (e.g. `frontmatter`) after
// a fresh venv install triggers a compile-and-write to that cache — and
// since Jest runs different test files as separate parallel worker
// processes by default, two workers' fixture repos can each spawn a Python
// process that hits that first-time compile at nearly the same moment,
// racing on the same cache file. Confirmed as the cause here: the identical
// setupTestRepo.js fixture-creation code succeeded in one test file's
// worker and failed with a transient ModuleNotFoundError in another's,
// in the same `npm test` run — a manual, single-process reproduction of
// the exact same fixture never reproduced it. This is a small, permanent
// fix rather than forcing the whole suite to run single-threaded.
const PYTHON_ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };

// topicSlug (raw mode) and slug (deliverable mode) both end up building a
// filesystem path inside new_research_session.py (folder_name/file_path via
// pathlib's `/` operator) with no sanitization on that script's side — a
// value containing "../" or an absolute path escapes the intended folder
// entirely. Reject anything that isn't a plain kebab-case slug here, before
// it ever reaches the script, rather than trying to sanitize/escape it.
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

// Mirrors EditRecordForm.jsx's STATUS_OPTIONS on the frontend. Enforced here
// too — not just client-side — since a direct API call bypassing the UI
// entirely could otherwise set a record's status to an arbitrary or empty
// string, silently overwriting whatever it actually was.
const STATUS_OPTIONS = ['raw', 'in-review', 'synthesized', 'draft', 'final', 'superseded'];

// Every Python script invoked below (new_research_session.py, export_records.py,
// build_index.py) prints a clean, single-line message to stderr on an expected
// failure (a validation error, "No record found", etc.) — but on a genuine
// unhandled exception, Python's default behavior is to print a full traceback,
// including absolute file paths and internals, to stderr instead. Forwarding
// that verbatim to whoever's logged in would be the same category of
// information leak as the Express-level stack-trace bug already fixed
// elsewhere in this file's error-handling middleware, just one layer deeper —
// at the subprocess boundary instead of the HTTP layer. This detects that
// specific signature, logs the real detail server-side, and returns a generic
// message to the client instead.
const TRACEBACK_MARKER = 'Traceback (most recent call last):';

function scriptErrorMessage(err, context) {
  const raw = (err.stderr || err.message || '').trim();
  if (raw.includes(TRACEBACK_MARKER)) {
    console.error(`[${context}] unexpected script error:\n${raw}`);
    return { message: 'internal server error', isCrash: true };
  }
  return { message: raw, isCrash: false };
}

// Used for tags/relatedComponents/relatedFindings (POST /sessions) and
// frontmatter.tags (PUT /records/:id): each must be a plain string (comma-
// separated, matching the frontend's own convention) or an array of strings.
// Anything else — a number, an object, a mixed array — would otherwise reach
// execFile's argument list or gray-matter's YAML writer as-is, either
// throwing an opaque low-level error or silently writing malformed
// frontmatter, instead of a clear, actionable 400.
function isStringOrStringArray(value) {
  return typeof value === 'string'
    || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}

// Maps a record's kind (and, for deliverables, its `type`, which
// export_records.py sets to the folder name — see build_deliverable_records
// in agentic-repo's build_search_ui.py) to the attribution frontmatter field
// that applies to it, or null if no attribution field exists for that kind.
function attributionField(kind, type) {
  if (kind === 'raw' || kind === 'finding' || kind === 'analytics') return 'researcher';
  if (kind === 'deliverable') return type === 'heuristic-evaluations' ? 'evaluator' : 'designer';
  return null; // component, and anything else
}

// Create-time attribution rule: default to the creator when the field is
// omitted; allow setting it to yourself; reject setting it to anyone else
// unless the requester is a lead. Returns the resolved value to write, or
// throws (caller turns that into a 400) when a non-lead tries to reassign.
function resolveAttributionOnCreate(fieldValue, user) {
  const trimmed = (fieldValue || '').toString().trim();
  if (!trimmed) return user.git_name;
  if (trimmed === user.git_name) return trimmed;
  if (user.is_lead) return trimmed;
  throw new Error('only a lead can set this to someone other than yourself');
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }
  next();
}

// Every route below requires a logged-in session.
router.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /sessions — wraps new_research_session.py, both modes.
// ---------------------------------------------------------------------------
router.post('/sessions', writeLimiter, async (req, res) => {
  const { mode } = req.body;
  const user = getUser(req);

  if (mode !== 'raw' && mode !== 'deliverable') {
    return res.status(400).json({ error: 'mode must be "raw" or "deliverable"' });
  }

  const args = [path.join(SCRIPTS_DIR, 'new_research_session.py')];

  if (mode === 'raw') {
    const { title, type, topicSlug, tags, relatedComponents, relatedFindings, researcher, methodLabel, date } = req.body;

    // .trim() checks, not just truthiness — a whitespace-only string like
    // "   " is truthy in JS, so a plain `!title` check would let it through
    // and create a session with a blank-looking title.
    if (!title || !title.trim() || !type || !type.trim() || !topicSlug || !topicSlug.trim()) {
      return res.status(400).json({ error: 'raw mode requires title, type, and topicSlug' });
    }
    if (!SAFE_SLUG_RE.test(topicSlug)) {
      return res.status(400).json({ error: 'topicSlug must match ^[a-z0-9-]+$' });
    }
    if (tags !== undefined && !isStringOrStringArray(tags)) {
      return res.status(400).json({ error: 'tags must be a string or an array of strings' });
    }
    if (relatedComponents !== undefined && !isStringOrStringArray(relatedComponents)) {
      return res.status(400).json({ error: 'relatedComponents must be a string or an array of strings' });
    }
    if (relatedFindings !== undefined && !isStringOrStringArray(relatedFindings)) {
      return res.status(400).json({ error: 'relatedFindings must be a string or an array of strings' });
    }

    let resolvedResearcher;
    try {
      resolvedResearcher = resolveAttributionOnCreate(researcher, user);
    } catch (err) {
      return res.status(400).json({ error: `researcher: ${err.message}` });
    }

    args.push('--title', title, '--type', type, '--topic-slug', topicSlug);
    if (tags) args.push('--tags', Array.isArray(tags) ? tags.join(',') : tags);
    if (relatedComponents) args.push('--related-components', Array.isArray(relatedComponents) ? relatedComponents.join(',') : relatedComponents);
    if (relatedFindings) args.push('--related-findings', Array.isArray(relatedFindings) ? relatedFindings.join(',') : relatedFindings);
    args.push('--researcher', resolvedResearcher);
    if (methodLabel) args.push('--method-label', methodLabel);
    if (date) args.push('--date', date);
  } else {
    const {
      folder, title, slug, tags, relatedFindings, date, status,
      sourceType, protoType, description,
    } = req.body;

    if (!folder || !folder.trim() || !title || !title.trim() || !slug || !slug.trim()) {
      return res.status(400).json({ error: 'deliverable mode requires folder, title, and slug' });
    }
    if (!SAFE_SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'slug must match ^[a-z0-9-]+$' });
    }
    if (tags !== undefined && !isStringOrStringArray(tags)) {
      return res.status(400).json({ error: 'tags must be a string or an array of strings' });
    }
    if (relatedFindings !== undefined && !isStringOrStringArray(relatedFindings)) {
      return res.status(400).json({ error: 'relatedFindings must be a string or an array of strings' });
    }

    // new_research_session.py only exposes a --designer CLI flag — the
    // evaluator field (heuristic-evaluations/) has no CLI equivalent, only
    // an interactive prompt, which --no-prompt (always passed below since
    // this is a non-interactive caller) bypasses. So attribution can only be
    // enforced/set for designer at creation time; a heuristic-evaluations
    // record's evaluator field is written blank here and can only be set
    // afterward via PUT, where the same enforcement applies.
    if (folder !== 'heuristic-evaluations') {
      let resolvedDesigner;
      try {
        resolvedDesigner = resolveAttributionOnCreate(req.body.designer, user);
      } catch (err) {
        return res.status(400).json({ error: `designer: ${err.message}` });
      }
      args.push('--designer', resolvedDesigner);
    }

    // --no-prompt always passed: the API is a non-interactive caller, so
    // interactive prompting (the script's default) would just hang.
    args.push('--type', folder, '--title', title, '--slug', slug, '--no-prompt');
    if (tags) args.push('--tags', Array.isArray(tags) ? tags.join(',') : tags);
    if (relatedFindings) args.push('--related-findings', Array.isArray(relatedFindings) ? relatedFindings.join(',') : relatedFindings);
    if (date) args.push('--date', date);
    if (status) args.push('--status', status);
    if (sourceType) args.push('--source-type', sourceType);
    if (protoType) args.push('--proto-type', protoType);
    if (description) args.push('--description', description);
  }

  try {
    const { stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR, env: PYTHON_ENV });

    const createdMatch = stdout.match(/✅ Created (.+?)(?:\n|$)/);
    if (createdMatch) {
      const createdPath = path.relative(AGENTIC_REPO_ROOT, createdMatch[1].trim());
      await commitChange(`Create ${createdPath}`, user);
    }

    res.status(201).json({ message: stdout.trim() });
  } catch (err) {
    const { message, isCrash } = scriptErrorMessage(err, 'POST /sessions');
    res.status(isCrash ? 500 : 400).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /records and GET /records/:id — shell out to export_records.py.
// The :id segment can contain a slash (e.g. "deliverable:personas/foo"), so a
// plain Express :id param won't match past the first "/". Using a named
// wildcard ("*splat", required by Express 5's router) instead, and pulling
// the id back out of req.path ourselves.
// ---------------------------------------------------------------------------
router.get('/records', async (req, res) => {
  const { kind, summary } = req.query;
  const args = [path.join(SCRIPTS_DIR, 'export_records.py')];
  if (kind) args.push('--kind', kind);
  if (summary === 'true') args.push('--summary');

  try {
    const { stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR, env: PYTHON_ENV });
    res.json(JSON.parse(stdout));
  } catch (err) {
    const { message } = scriptErrorMessage(err, 'GET /records');
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /records/:id/history — shells out to `git log --follow` for the
// record's full edit history.
// ---------------------------------------------------------------------------
router.get('/records/*splat/history', async (req, res) => {
  const id = decodeURIComponent(req.path.replace(/^\/records\//, '').replace(/\/history$/, ''));

  let record;
  try {
    record = await fetchRecord(id);
  } catch (err) {
    const { message, isCrash } = scriptErrorMessage(err, 'GET /records/:id/history (fetchRecord)');
    return res.status(isCrash ? 500 : 404).json({ error: message });
  }

  const relativePath = path.relative(AGENTIC_REPO_ROOT, record.filePath);

  try {
    const { stdout } = await execFileAsync(
        'git',
        ['log', '--follow', '--pretty=format:%H|%an|%ae|%aI|%s', '--', relativePath],
        { cwd: AGENTIC_REPO_ROOT },
    );
    const history = stdout.split('\n').filter(Boolean).map(line => {
      const [hash, authorName, authorEmail, date, message] = line.split('|');
      return { hash, authorName, authorEmail, date, message };
    });
    res.json(history);
  } catch (err) {
    const { message } = scriptErrorMessage(err, 'GET /records/:id/history (git log)');
    res.status(500).json({ error: message });
  }
});

router.get('/records/*splat', async (req, res) => {
  const id = decodeURIComponent(req.path.replace(/^\/records\//, ''));
  const args = [path.join(SCRIPTS_DIR, 'export_records.py'), '--id', id];

  try {
    const { stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR, env: PYTHON_ENV });
    res.json(JSON.parse(stdout));
  } catch (err) {
    // export_records.py exits 1 with "No record found" on stderr when the id doesn't match.
    const { message, isCrash } = scriptErrorMessage(err, 'GET /records/:id');
    res.status(isCrash ? 500 : 404).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Shared helper: fetch a record's full data (via export_records.py --id),
// including its `kind` and resolved on-disk `path` — the script is the
// single source of truth for both, so nothing here duplicates that logic.
// ---------------------------------------------------------------------------
async function fetchRecord(id) {
  const { stdout } = await execFileAsync(
    PYTHON_BIN,
    [path.join(SCRIPTS_DIR, 'export_records.py'), '--id', id],
    { cwd: SCRIPTS_DIR, env: PYTHON_ENV },
  );
  const record = JSON.parse(stdout);
  // record.path is always relative to research/ (either directly, e.g.
  // "raw/.../session-notes.md", or via a leading "../", e.g.
  // "../research-plans/foo.md" for deliverables) — path.join resolves both
  // correctly against RESEARCH_ROOT.
  record.filePath = path.join(RESEARCH_ROOT, record.path);
  return record;
}

// ---------------------------------------------------------------------------
// Shared helper: look up the logged-in user's git identity for attribution.
// ---------------------------------------------------------------------------
function getUser(req) {
  return db.prepare('SELECT git_name, git_email, is_lead FROM users WHERE id = ?')
    .get(req.session.userId);
}

// ---------------------------------------------------------------------------
// Shared helper: stage and commit whatever changed in AGENTIC_REPO_ROOT,
// attributed to the given user. Bundles the record change and any
// build_index.py-regenerated index files into one atomic commit ("git add -A"
// stages everything touched by this request, not just one known file).
// ---------------------------------------------------------------------------
async function commitChange(message, user) {
  try {
    await execFileAsync('git', ['add', '-A'], { cwd: AGENTIC_REPO_ROOT });
    await execFileAsync(
      'git',
      ['commit', '--author', `${user.git_name} <${user.git_email}>`, '-m', message],
      { cwd: AGENTIC_REPO_ROOT },
    );
  } catch (err) {
    // git commit exits non-zero when there's nothing staged (e.g. a PUT with
    // no actual change) — that's a no-op, not a failure. Any other failure
    // here is re-thrown and, since this is an async Express route handler,
    // Express 5 forwards the rejection to app.js's generic error-handling
    // middleware automatically — which already returns a safe, generic
    // message rather than a raw stack trace, so no additional handling is
    // needed at the call sites below.
    if (!/nothing to commit/i.test(err.stdout || err.message || '')) {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// PUT /records/:id — no script exists for editing, so read/modify/write the
// markdown file directly, then re-run build_index.py to refresh indexes.
// ---------------------------------------------------------------------------
router.put('/records/*splat', writeLimiter, async (req, res) => {
  const id = decodeURIComponent(req.path.replace(/^\/records\//, ''));
  const user = getUser(req);
  const { frontmatter, content } = req.body;

  if (!frontmatter && content === undefined) {
    return res.status(400).json({ error: 'request body must include frontmatter and/or content' });
  }

  // Server-side guards, not just the frontend's — a direct API call
  // bypasses EditRecordForm.jsx entirely, so its client-side checks (added
  // last session) offer zero real protection on their own.
  if (frontmatter) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, 'title') && !frontmatter.title.trim()) {
      return res.status(400).json({ error: 'frontmatter.title cannot be blank' });
    }
    if (Object.prototype.hasOwnProperty.call(frontmatter, 'status') && !STATUS_OPTIONS.includes(frontmatter.status)) {
      return res.status(400).json({ error: `frontmatter.status must be one of: ${STATUS_OPTIONS.join(', ')}` });
    }
    if (Object.prototype.hasOwnProperty.call(frontmatter, 'tags') && !isStringOrStringArray(frontmatter.tags)) {
      return res.status(400).json({ error: 'frontmatter.tags must be a string or an array of strings' });
    }
  }

  let filePath;
  let record;
  try {
    record = await fetchRecord(id);
    filePath = record.filePath;
  } catch (err) {
    const { message, isCrash } = scriptErrorMessage(err, 'PUT /records/:id (fetchRecord)');
    return res.status(isCrash ? 500 : 404).json({ error: message });
  }

  // Attribution enforcement — only when the field is actually being changed.
  // EditRecordForm.jsx pre-fills a non-lead's disabled attribution field
  // with the record's current value, so a plain re-save (nothing reassigned)
  // must not be rejected; only an attempt to change it to someone other than
  // yourself requires being a lead.
  if (frontmatter) {
    const field = attributionField(record.kind, record.type);
    if (field && Object.prototype.hasOwnProperty.call(frontmatter, field)) {
      const newValue = (frontmatter[field] || '').toString().trim();
      const oldValue = (record[field] || '').toString().trim();
      if (newValue !== oldValue && newValue !== user.git_name && !user.is_lead) {
        return res.status(400).json({ error: `only a lead can set ${field} to someone other than yourself` });
      }
    }
  }

  try {
    const existing = await fs.readFile(filePath, 'utf8');
    const parsed = matter(existing);

    const updatedFrontmatter = {
      ...(frontmatter ? { ...parsed.data, ...frontmatter } : parsed.data),
      last_edited_by: user.git_name,
      last_edited_at: new Date().toISOString(),
    };
    const updatedContent = content !== undefined ? content : parsed.content;

    for (const key of Object.keys(updatedFrontmatter)) {
      if (updatedFrontmatter[key] instanceof Date) {
        updatedFrontmatter[key] = updatedFrontmatter[key].toISOString().slice(0, 10);
      }
    }

    const newFileText = matter.stringify(updatedContent, updatedFrontmatter);
    await fs.writeFile(filePath, newFileText, 'utf8');
  } catch (err) {
    return res.status(500).json({ error: `failed to write file: ${err.message}` });
  }

  let indexWarning = null;
  try {
    await execFileAsync(PYTHON_BIN, [path.join(SCRIPTS_DIR, 'build_index.py')], { cwd: SCRIPTS_DIR, env: PYTHON_ENV });
  } catch (err) {
    const { message } = scriptErrorMessage(err, 'PUT /records/:id (build_index.py)');
    indexWarning = message;
  }

  await commitChange(`Update ${path.relative(AGENTIC_REPO_ROOT, filePath)}`, user);

  if (indexWarning) {
    return res.status(200).json({
      message: 'record updated and committed, but build_index.py reported issues',
      warning: indexWarning,
    });
  }
  res.json({ message: `${filePath} updated, index refreshed, and change committed` });
});

// ---------------------------------------------------------------------------
// DELETE /records/:id — same fetch-then-act pattern as PUT, but folder-aware:
// a "raw" record is actually a pair of files (session-notes.md +
// participants.md) sharing one dated folder, not a single file like every
// other kind. Deleting only session-notes.md (record.path) would silently
// orphan participants.md — remove the whole session folder for raw records,
// and just the single file for every other kind (finding/component/
// analytics/deliverable, all of which are genuinely one file each).
// ---------------------------------------------------------------------------
router.delete('/records/*splat', writeLimiter, async (req, res) => {
  const id = decodeURIComponent(req.path.replace(/^\/records\//, ''));
  const user = getUser(req);

  let record;
  try {
    record = await fetchRecord(id);
  } catch (err) {
    const { message, isCrash } = scriptErrorMessage(err, 'DELETE /records/:id (fetchRecord)');
    return res.status(isCrash ? 500 : 404).json({ error: message });
  }

  try {
    if (record.kind === 'raw') {
      await fs.rm(path.dirname(record.filePath), { recursive: true, force: true });
    } else {
      await fs.unlink(record.filePath);
    }
  } catch (err) {
    return res.status(500).json({ error: `failed to delete: ${err.message}` });
  }

  let indexWarning = null;
  try {
    await execFileAsync(PYTHON_BIN, [path.join(SCRIPTS_DIR, 'build_index.py')], { cwd: SCRIPTS_DIR, env: PYTHON_ENV });
  } catch (err) {
    const { message } = scriptErrorMessage(err, 'DELETE /records/:id (build_index.py)');
    indexWarning = message;
  }

  await commitChange(`Delete ${record.path}`, user);

  if (indexWarning) {
    return res.status(200).json({
      message: 'record deleted and committed, but build_index.py reported issues',
      warning: indexWarning,
    });
  }
  res.status(204).end();
});

module.exports = router;
module.exports._scriptErrorMessage = scriptErrorMessage;
