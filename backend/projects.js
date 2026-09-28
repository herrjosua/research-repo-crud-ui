// Project tagging rules from agentic-repo (see its docs/projects.md): every
// record carries exactly one project-* tag. Findings, analytics summaries and
// deliverables keep it in their own `tags:` frontmatter. Raw sessions and
// components get theirs from research/projects.yml when records load, so
// their files never carry one (raw/ is append-only; components are
// generated). build_index.py fails on a finding/summary/deliverable without
// exactly one project tag, and on a projects.yml entry for a raw session
// folder that no longer exists.
//
// Project tagging is only on in a checkout that has research/projects.yml.
// Without it (the test and e2e fixture corpora), every function here is a
// no-op, matching agentic-repo's own scripts.
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const PROJECTS_FILE = path.join('research', 'projects.yml');
const PROJECT_TAG_PREFIX = 'project-';

// Kinds whose project tag lives in their own frontmatter.
const SELF_TAGGED_KINDS = ['finding', 'analytics', 'deliverable'];

function hasProjectsFile(repoRoot) {
  return fs.existsSync(path.join(repoRoot, PROJECTS_FILE));
}

function isProjectTag(tag) {
  return typeof tag === 'string' && tag.startsWith(PROJECT_TAG_PREFIX);
}

// A tag list with every project-* tag taken out. Anything that isn't an array
// (null, or a comma-separated string on create) is handled by the caller.
function withoutProjectTags(tags) {
  return tags.filter((tag) => !isProjectTag(tag));
}

// The `tags` value to write for a PUT, given what the client sent and what the
// file already has. Returns `incoming` unchanged when no rule applies.
//
// - raw: project-* is stripped, so nothing project-related lands in raw/.
// - finding/analytics/deliverable: the file's existing project-* tag(s) are
//   kept, at the end where agentic-repo writes them, and any project-* tag in
//   the request is ignored. A record with none stays with none.
function projectSafeTags(kind, incoming, existing) {
  if (kind === 'raw') {
    return Array.isArray(incoming) ? withoutProjectTags(incoming) : incoming;
  }
  if (!SELF_TAGGED_KINDS.includes(kind)) return incoming;

  const kept = Array.isArray(existing) ? existing.filter(isProjectTag) : [];
  const rest = Array.isArray(incoming) ? withoutProjectTags(incoming) : [];
  if (kept.length === 0 && !Array.isArray(incoming)) return incoming; // e.g. tags: null on an untagged record
  return [...rest, ...kept];
}

// Removes the `<folder>: project-...` line from projects.yml's raw: map, as a
// plain-text edit so comments and formatting survive (the same approach
// new_research_session.py uses to add it). Returns 'removed', 'absent'
// (nothing to do), or 'skipped' after logging why. Never throws: the caller's
// delete has already happened, and a stale entry only makes build_index.py
// report an issue.
function removeRawSessionEntry(repoRoot, folder) {
  const file = path.join(repoRoot, PROJECTS_FILE);
  const skip = (reason) => {
    console.warn(`[projects.yml] didn't remove raw entry ${folder} (${reason}); remove it by hand`);
    return 'skipped';
  };

  let text;
  let before;
  try {
    text = fs.readFileSync(file, 'utf8');
    before = matter.engines.yaml.parse(text) || {};
  } catch (err) {
    return err.code === 'ENOENT' ? 'absent' : skip('file is unreadable or not valid YAML');
  }
  const raw = before.raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'absent';
  if (!Object.prototype.hasOwnProperty.call(raw, folder)) return 'absent';

  // The raw: block runs from its top-level `raw:` line to the next top-level
  // key. Only a block mapping is edited; anything else is left alone.
  const lines = text.split(/(?<=\n)/);
  const start = lines.findIndex((line) => /^raw:[ \t]*(#.*)?\r?\n?$/.test(line));
  if (start === -1) return skip('raw: isn\'t a block mapping');
  let end = start + 1;
  while (end < lines.length && (/^\s*(#.*)?\r?\n?$/.test(lines[end]) || /^[ \t]/.test(lines[end]))) end += 1;

  // Folder names are SAFE_SLUG_RE-shaped (date plus kebab-case slug), so they
  // need no regex escaping beyond what this character class already covers.
  const entry = new RegExp(`^[ \\t]+(["']?)${folder}\\1:[ \\t]`);
  const matches = [];
  for (let i = start + 1; i < end; i += 1) {
    if (entry.test(lines[i])) matches.push(i);
  }
  if (matches.length !== 1) return skip(`found ${matches.length} matching lines`);

  const newText = lines.filter((_, i) => i !== matches[0]).join('');

  // Only that one entry may change.
  let after;
  try {
    after = matter.engines.yaml.parse(newText) || {};
  } catch {
    return skip('the edited file wouldn\'t parse');
  }
  const expectedRaw = { ...raw };
  delete expectedRaw[folder];
  if (JSON.stringify({ ...after, raw: after.raw || {} }) !== JSON.stringify({ ...before, raw: expectedRaw })) {
    return skip('couldn\'t remove the entry cleanly');
  }

  try {
    fs.writeFileSync(file, newText, 'utf8');
  } catch {
    return skip('couldn\'t write the file');
  }
  return 'removed';
}

module.exports = {
  PROJECTS_FILE,
  hasProjectsFile,
  isProjectTag,
  withoutProjectTags,
  projectSafeTags,
  removeRawSessionEntry,
};
