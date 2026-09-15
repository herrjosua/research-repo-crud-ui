const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const matter = require('gray-matter');

const execFileAsync = promisify(execFile);
const router = express.Router();

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
router.post('/sessions', async (req, res) => {
  const { mode } = req.body;

  if (mode !== 'raw' && mode !== 'deliverable') {
    return res.status(400).json({ error: 'mode must be "raw" or "deliverable"' });
  }

  const args = [path.join(SCRIPTS_DIR, 'new_research_session.py')];

  if (mode === 'raw') {
    const { title, type, topicSlug, tags, relatedComponents, relatedFindings, researcher, methodLabel, date } = req.body;

    if (!title || !type || !topicSlug) {
      return res.status(400).json({ error: 'raw mode requires title, type, and topicSlug' });
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
    res.status(201).json({ message: stdout.trim() });
  } catch (err) {
    // new_research_session.py exits 1 with a printed error on stderr for
    // expected failures (overwrite guard, missing required args, etc).
    res.status(400).json({ error: (err.stderr || err.message).trim() });
  }
});

// ---------------------------------------------------------------------------
// GET /records and GET /records/:id — shell out to export_records.py.
// ---------------------------------------------------------------------------
router.get('/records', async (req, res) => {
  const { kind } = req.query;
  const args = [path.join(SCRIPTS_DIR, 'export_records.py')];
  if (kind) args.push('--kind', kind);

  try {
    const { stdout } = await execFileAsync(PYTHON_BIN, args, { cwd: SCRIPTS_DIR });
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: (err.stderr || err.message).trim() });
  }
});

router.get('/records/:id', async (req, res) => {
  const args = [path.join(SCRIPTS_DIR, 'export_records.py'), '--id', req.params.id];

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
// PUT /records/:id — no script exists for editing, so read/modify/write the
// markdown file directly, then re-run build_index.py to refresh indexes.
// ---------------------------------------------------------------------------
router.put('/records/:id', async (req, res) => {
  const { id } = req.params;
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

    const updatedFrontmatter = frontmatter ? { ...parsed.data, ...frontmatter } : parsed.data;
    const updatedContent = content !== undefined ? content : parsed.content;

    const newFileText = matter.stringify(updatedContent, updatedFrontmatter);
    await fs.writeFile(filePath, newFileText, 'utf8');
  } catch (err) {
    return res.status(500).json({ error: `failed to write file: ${err.message}` });
  }

  try {
    await execFileAsync(PYTHON_BIN, [path.join(SCRIPTS_DIR, 'build_index.py')], { cwd: SCRIPTS_DIR });
  } catch (err) {
    // File was written successfully even if reindex reports problems (e.g. a
    // dangling tag reference) — that's a warning, not a failure of the edit.
    return res.status(200).json({
      message: 'record updated, but build_index.py reported issues',
      warning: (err.stderr || err.message).trim(),
    });
  }

  res.json({ message: `${filePath} updated and index refreshed` });
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
router.delete('/records/:id', async (req, res) => {
  const { id } = req.params;

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

  try {
    await execFileAsync(PYTHON_BIN, [path.join(SCRIPTS_DIR, 'build_index.py')], { cwd: SCRIPTS_DIR });
  } catch (err) {
    return res.status(200).json({
      message: 'record deleted, but build_index.py reported issues',
      warning: (err.stderr || err.message).trim(),
    });
  }

  res.status(204).end();
});

module.exports = router;
