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

// topicSlug (raw mode) and slug (deliverable mode) both end up building a
// filesystem path inside new_research_session.py (folder_name/file_path via
// pathlib's `/` operator) with no sanitization on that script's side — a
// value containing "../" or an absolute path escapes the intended folder
// entirely. Reject anything that isn't a plain kebab-case slug here, before
// it ever reaches the script, rather than trying to sanitize/escape it.
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

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

    if (!title || !type || !topicSlug) {
      return res.status(400).json({ error: 'raw mode requires title, type, and topicSlug' });
    }
    if (!SAFE_SLUG_RE.test(topicSlug)) {
      return res.status(400).json({ error: 'topicSlug must match ^[a-z0-9-]+$' });
    }

    args.push('--title', title, '--type', type, '--topic-slug', topicSlug);
    if (tags) args.push('--tags', Array.isArray(tags) ? tags.join(',') : tags);
    if (relatedComponents) args.push('--related-components', Array.isArray(relatedComponents) ? relatedComponents.join(',') : relatedComponents);
    if (relatedFindings) args.push('--related-findings', Array.isArray(relatedFindings) ? relatedFindings.join(',') : relatedFindings);
    if (researcher) args.push('--researcher', researcher);
    if (methodLabel) args.push('--method-label', methodLabel);
    if (date) args.push('--date', date);
  } else {
    const {
      folder, title, slug, tags, relatedFindings, date, status,
      sourceType, protoType, description,
    } = req.body;

    if (!folder || !title || !slug) {
      return res.status(400).json({ error: 'deliverable mode requires folder, title, and slug' });
    }
    if (!SAFE_SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'slug must match ^[a-z0-9-]+$' });
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
    const { stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR });

    const createdMatch = stdout.match(/✅ Created (.+?)(?:\n|$)/);
    if (createdMatch) {
      const createdPath = path.relative(AGENTIC_REPO_ROOT, createdMatch[1].trim());
      await commitChange(`Create ${createdPath}`, user);
    }

    res.status(201).json({ message: stdout.trim() });
  } catch (err) {
    res.status(400).json({ error: (err.stderr || err.message).trim() });
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
    const { stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR });
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: (err.stderr || err.message).trim() });
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
    return res.status(404).json({ error: (err.stderr || err.message).trim() });
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
    res.status(500).json({ error: (err.stderr || err.message).trim() });
  }
});

router.get('/records/*splat', async (req, res) => {
  const id = decodeURIComponent(req.path.replace(/^\/records\//, ''));
  const args = [path.join(SCRIPTS_DIR, 'export_records.py'), '--id', id];

  try {
    const { stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR });
    res.json(JSON.parse(stdout));
  } catch (err) {
    // export_records.py exits 1 with "No record found" on stderr when the id doesn't match.
    res.status(404).json({ error: (err.stderr || err.message).trim() });
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
    { cwd: SCRIPTS_DIR },
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
  return db.prepare('SELECT git_name, git_email FROM users WHERE id = ?')
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
    // no actual change) — that's a no-op, not a failure.
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

  let filePath;
  try {
    const record = await fetchRecord(id);
    filePath = record.filePath;
  } catch (err) {
    return res.status(404).json({ error: (err.stderr || err.message).trim() });
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
    await execFileAsync(PYTHON_BIN, [path.join(SCRIPTS_DIR, 'build_index.py')], { cwd: SCRIPTS_DIR });
  } catch (err) {
    indexWarning = (err.stderr || err.message).trim();
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
    return res.status(404).json({ error: (err.stderr || err.message).trim() });
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
    await execFileAsync(PYTHON_BIN, [path.join(SCRIPTS_DIR, 'build_index.py')], { cwd: SCRIPTS_DIR });
  } catch (err) {
    indexWarning = (err.stderr || err.message).trim();
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
