const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const fsSync = require('fs');
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

const {
  SAFE_SLUG_RE,
  DELIVERABLE_FOLDERS,
  validateCreate,
  validateFrontmatterPatch,
  normalizeFrontmatterDates,
} = require('../validation');

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

// Records under design-tokens/ are written by agentic-repo's
// sync_figma_tokens.py straight from Figma, which is their source of truth,
// so PUT and DELETE refuse them. Keyed on path (set by export_records.py, not
// editable through this API) rather than status, which a PUT or a hand edit
// could change.
const GENERATED_PATH_PREFIX = '../design-tokens/';
const GENERATED_READ_ONLY_ERROR = 'Generated from Figma: edit the source in Figma and re-run the token sync';

function isGeneratedRecord(record) {
  return typeof record.path === 'string' && record.path.startsWith(GENERATED_PATH_PREFIX);
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

  // Types, allowlists, line breaks, dates, and lengths. Runs before the
  // required-field checks below, which call .trim() and would throw (500) on
  // a non-string.
  const createError = validateCreate(mode, req.body);
  if (createError) {
    return res.status(400).json({ error: createError });
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

    // Only designer is passed at creation time. new_research_session.py also
    // has an --evaluator flag now (heuristic-evaluations/ only), but this
    // route doesn't pass it yet, so a heuristic-evaluations record's
    // evaluator field is written blank here and can only be set afterward via
    // PUT, where the same attribution enforcement applies.
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

  await withRepoLock(async () => {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR, env: PYTHON_ENV }));
    } catch (err) {
      const { message, isCrash } = scriptErrorMessage(err, 'POST /sessions');
      return res.status(isCrash ? 500 : 400).json({ error: message });
    }

    // The created file (deliverable) or session folder (raw: session-notes.md
    // plus participants.md). POST doesn't run build_index.py.
    const createdMatch = stdout.match(/✅ Created (.+?)(?:\n|$)/);
    if (createdMatch) {
      // The script prints a fully resolved path, so resolve the root too
      // (e.g. macOS /var -> /private/var), or the relative path escapes it.
      const createdPath = path.relative(await fs.realpath(AGENTIC_REPO_ROOT), createdMatch[1].trim());
      await commitChange(`Create ${createdPath}`, user, [createdPath]);
    }

    res.status(201).json({ message: stdout.trim() });
  });
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
    const record = JSON.parse(stdout);
    res.json({ ...record, read_only: isGeneratedRecord(record) });
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
// Shared helper: serialize every write to AGENTIC_REPO_ROOT. Each write route
// awaits between touching files, running build_index.py, and committing, so
// without this two requests interleave: one's files land in the other's
// commit, concurrent git commands collide on .git/index.lock, and two PUTs to
// the same record each merge into a stale read and drop the other's change.
// One Node process serves every request, so an in-memory queue is enough.
// Released in `finally`, so a request that throws can't jam the ones behind it.
// ---------------------------------------------------------------------------
let repoLockTail = Promise.resolve();

async function withRepoLock(fn) {
  const previous = repoLockTail;
  let release;
  repoLockTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

// Every file build_index.py can rewrite (see its main()): the research and
// analytics indexes, plus one _index.md per deliverable folder.
const INDEX_PATHS = [
  'research/_index.md',
  'analytics/_index.md',
  ...DELIVERABLE_FOLDERS.map((folder) => `${folder}/_index.md`),
];

// ---------------------------------------------------------------------------
// Shared helper: stage and commit exactly `paths` (relative to
// AGENTIC_REPO_ROOT; a directory covers everything under it, deletions
// included), attributed to the given user. Anything else in the working tree
// (token sync output, hand edits, files someone already staged) is left
// exactly as it was, uncommitted.
// ---------------------------------------------------------------------------
async function commitChange(message, user, paths) {
  // Literal pathspecs: these are file paths, never globs.
  const git = (args) => execFileAsync('git', ['--literal-pathspecs', ...args], { cwd: AGENTIC_REPO_ROOT });

  // git rejects a pathspec that matches nothing, so keep paths that exist on
  // disk, plus the tracked files under any that don't (a deleted record).
  const onDisk = paths.filter((p) => fsSync.existsSync(path.join(AGENTIC_REPO_ROOT, p)));
  const gone = paths.filter((p) => !onDisk.includes(p));
  let deletedTracked = [];
  if (gone.length) {
    const { stdout } = await git(['ls-files', '-z', '--', ...gone]);
    deletedTracked = stdout.split('\0').filter(Boolean);
  }
  const pathspecs = [...onDisk, ...deletedTracked];
  if (pathspecs.length === 0) return;

  await git(['add', '-A', '--', ...pathspecs]);

  // Exit 0 means nothing staged under these paths: a no-op, not a failure.
  try {
    await git(['diff', '--cached', '--quiet', '--', ...pathspecs]);
    return;
  } catch (err) {
    if (err.code !== 1) throw err;
  }

  // The pathspec limits the commit to these paths even if other changes are
  // already staged. Any failure is re-thrown to app.js's generic error
  // handler, which returns a safe message rather than a stack trace.
  await git(['commit', '--author', `${user.git_name} <${user.git_email}>`, '-m', message, '--', ...pathspecs]);
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
  // bypasses EditRecordForm.jsx entirely, so its client-side checks offer
  // zero real protection on their own. Everything in frontmatter is merged
  // into the file as-is below, so every key is checked, not just the ones
  // the form sends — see validation.js for the rules.
  const patchError = validateFrontmatterPatch(frontmatter || undefined, content);
  if (patchError) {
    return res.status(400).json({ error: patchError });
  }

  // Locked from the fetch onward, so the read-merge-write below always starts
  // from the latest committed version of the file.
  await withRepoLock(async () => {
    let filePath;
    let record;
    try {
      record = await fetchRecord(id);
      filePath = record.filePath;
    } catch (err) {
      const { message, isCrash } = scriptErrorMessage(err, 'PUT /records/:id (fetchRecord)');
      return res.status(isCrash ? 500 : 404).json({ error: message });
    }

    if (isGeneratedRecord(record)) {
      return res.status(403).json({ error: GENERATED_READ_ONLY_ERROR });
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

      // Dates (gray-matter's parsed Dates, and ISO timestamps sent back by a
      // client) are written as plain YYYY-MM-DD.
      normalizeFrontmatterDates(updatedFrontmatter);

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

    const relPath = path.relative(AGENTIC_REPO_ROOT, filePath);
    await commitChange(`Update ${relPath}`, user, [relPath, ...INDEX_PATHS]);

    if (indexWarning) {
      return res.status(200).json({
        message: 'record updated and committed, but build_index.py reported issues',
        warning: indexWarning,
      });
    }
    res.json({ message: `${filePath} updated, index refreshed, and change committed` });
  });
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

  await withRepoLock(async () => {
    let record;
    try {
      record = await fetchRecord(id);
    } catch (err) {
      const { message, isCrash } = scriptErrorMessage(err, 'DELETE /records/:id (fetchRecord)');
      return res.status(isCrash ? 500 : 404).json({ error: message });
    }

    if (isGeneratedRecord(record)) {
      return res.status(403).json({ error: GENERATED_READ_ONLY_ERROR });
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

    // A raw record is its whole session folder (see the fs.rm above).
    const removed = record.kind === 'raw' ? path.dirname(record.filePath) : record.filePath;
    await commitChange(`Delete ${record.path}`, user, [path.relative(AGENTIC_REPO_ROOT, removed), ...INDEX_PATHS]);

    if (indexWarning) {
      return res.status(200).json({
        message: 'record deleted and committed, but build_index.py reported issues',
        warning: indexWarning,
      });
    }
    res.status(204).end();
  });
});

module.exports = router;
module.exports._scriptErrorMessage = scriptErrorMessage;
