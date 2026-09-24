// Input validation for the two routes that write frontmatter: POST /sessions
// (via new_research_session.py) and PUT /records/:id (via gray-matter,
// directly). agentic-repo's scripts now quote every frontmatter value and skip
// bad records instead of crashing, but a record they skip silently drops out
// of the index, search UI, and export — so a value that would get a record
// skipped (or break a list field every loader iterates over) is rejected here,
// with a 400 naming the field, before it ever reaches disk.
//
// Every validator below returns an error string, or null when the input is OK.

// topicSlug (raw mode) and slug (deliverable mode) both end up building a
// filesystem path inside new_research_session.py (folder_name/file_path via
// pathlib's `/` operator). The script now checks this itself too, but reject
// anything that isn't a plain kebab-case slug here as well, before it ever
// reaches the script, rather than trying to sanitize/escape it.
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

// Mirrors EditRecordForm.jsx's STATUS_OPTIONS on the frontend. Enforced here
// too — not just client-side — since a direct API call bypassing the UI
// entirely could otherwise set a record's status to an arbitrary or empty
// string, silently overwriting whatever it actually was.
const STATUS_OPTIONS = ['raw', 'in-review', 'synthesized', 'draft', 'final', 'superseded'];

// The allowlists below mirror new_research_session.py: VALID_TYPES,
// DELIVERABLE_SCHEMAS' keys, --status's argparse choices, and
// PROTO_TYPE_SOURCE_TYPE's keys. SOURCE_TYPES comes from --source-type's help
// text — the script itself doesn't enforce it, so this is stricter than the
// script on purpose. Keep these in sync if the script's lists change.
const RAW_TYPES = ['usability-test', 'interview', 'survey', 'contextual-inquiry', 'accessibility-audit', 'analytics'];
const DELIVERABLE_FOLDERS = [
  'research-plans', 'facilitation-guides', 'topline-summaries', 'research-readouts',
  'heuristic-evaluations', 'accessibility-screenings', 'service-topology', 'personas',
  'mental-models', 'mindsets', 'journey-maps', 'thumbnails', 'wireframes', 'user-flows',
  'wireflows', 'storyboards', 'mockups', 'prototypes', 'design-system', 'style-guide',
];
const DELIVERABLE_STATUSES = ['draft', 'in-review', 'final', 'superseded'];
const SOURCE_TYPES = ['native', 'figma-link', 'github-link', 'confluence-link', 'docx-link', 'figma-export'];
const PROTO_TYPES = ['clickthrough', 'coded'];

// The frontmatter fields every agentic-repo script treats as a list of strings
// (build_index.py's LIST_FIELDS) — anything else gets the record skipped.
const LIST_FIELDS = ['tags', 'related_components', 'related_findings', 'related_analytics'];

// Fields that hold a date. Only `date` is required to be a real one on PUT;
// the others (research-plans' study_dates.start/end, topline-summaries'
// session_dates) default to blank, so they're only normalized, not required.
const DATE_FIELDS = ['date', 'study_dates', 'session_dates'];

const MAX_TITLE = 200;
const MAX_NAME = 100; // slugs, researcher/designer names
const MAX_LIST_ITEM = 200;
const MAX_LIST_ITEMS = 50;
const MAX_BODY_FIELD = 2000; // methodLabel, description
const MAX_STRING = 1000; // any other frontmatter string

// Snake_case keys only — matches every key in agentic-repo today, and rules
// out "__proto__", keys containing newlines, and other YAML-hostile names.
const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// What a gray-matter-parsed date turns into once it's JSON-serialized (e.g. a
// client that reads the file itself and PUTs its frontmatter back).
const ISO_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// "2026-02-01T00:00:00.000Z" -> "2026-02-01". Takes the literal date part
// rather than converting time zones: gray-matter parses a bare YAML date as
// midnight UTC, so the date part is exactly what the file said.
function normalizeDate(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(ISO_TIMESTAMP_RE);
  return m ? m[1] : value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasLineBreak(value) {
  return /[\r\n]/.test(value);
}

// A single-line frontmatter string. `required` also rejects blank.
function checkLine(value, name, { max = MAX_STRING, required = false } = {}) {
  if (typeof value !== 'string') return `${name} must be a string`;
  if (required && !value.trim()) return `${name} cannot be blank`;
  if (hasLineBreak(value)) return `${name} cannot contain line breaks`;
  if (value.length > max) return `${name} must be at most ${max} characters`;
  return null;
}

function checkBody(value, name, max = MAX_BODY_FIELD) {
  if (typeof value !== 'string') return `${name} must be a string`;
  if (value.length > max) return `${name} must be at most ${max} characters`;
  return null;
}

function checkOneOf(value, name, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return `${name} must be one of: ${allowed.join(', ')}`;
  }
  return null;
}

function checkItems(items, name) {
  if (items.length > MAX_LIST_ITEMS) return `${name} can have at most ${MAX_LIST_ITEMS} items`;
  for (const item of items) {
    if (hasLineBreak(item)) return `${name} items cannot contain line breaks`;
    if (item.length > MAX_LIST_ITEM) return `${name} items must be at most ${MAX_LIST_ITEM} characters`;
  }
  return null;
}

// POST /sessions list inputs: a comma-separated string (the frontend's
// convention) or an array of strings.
function checkCreateList(value, name) {
  if (typeof value === 'string') return checkItems(value.split(','), name);
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return checkItems(value, name);
  return `${name} must be a string or an array of strings`;
}

// PUT list fields: array of strings, or null (the loaders normalize null to []).
// A bare string isn't accepted here — written as-is, the loaders would skip
// the record for not being a list.
function checkPutList(value, name) {
  if (value === null) return null;
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    return `${name} must be an array of strings or null`;
  }
  return checkItems(value, name);
}

function checkCreateDate(value) {
  if (typeof value !== 'string' || !isRealDate(value)) {
    return 'date must be a real calendar date in YYYY-MM-DD form';
  }
  return null;
}

// Runs every check in order and returns the first error, if any.
function firstError(checks) {
  for (const check of checks) {
    const err = check();
    if (err) return err;
  }
  return null;
}

// Only checks fields that were actually sent — required-field presence,
// SAFE_SLUG_RE, and attribution stay in records.js alongside the existing
// messages the frontend and tests depend on.
function validateCreate(mode, body) {
  // Blank/whitespace-only counts as absent here, so records.js's own
  // "requires ..." check reports it.
  const present = (key) => body[key] !== undefined && body[key] !== null
    && (typeof body[key] !== 'string' || body[key].trim() !== '');
  const checks = [];
  const line = (key, opts) => present(key) && checks.push(() => checkLine(body[key], key, opts));

  line('title', { max: MAX_TITLE });
  line('date');
  if (present('date')) checks.push(() => checkCreateDate(body.date));
  if (present('tags')) checks.push(() => checkCreateList(body.tags, 'tags'));
  if (present('relatedFindings')) checks.push(() => checkCreateList(body.relatedFindings, 'relatedFindings'));

  if (mode === 'raw') {
    if (present('type')) checks.push(() => checkOneOf(body.type, 'type', RAW_TYPES));
    line('topicSlug', { max: MAX_NAME });
    line('researcher', { max: MAX_NAME });
    if (present('relatedComponents')) checks.push(() => checkCreateList(body.relatedComponents, 'relatedComponents'));
    if (present('methodLabel')) checks.push(() => checkBody(body.methodLabel, 'methodLabel'));
  } else {
    if (present('folder')) checks.push(() => checkOneOf(body.folder, 'folder', DELIVERABLE_FOLDERS));
    line('slug', { max: MAX_NAME });
    line('designer', { max: MAX_NAME });
    if (present('status')) checks.push(() => checkOneOf(body.status, 'status', DELIVERABLE_STATUSES));
    if (present('sourceType')) checks.push(() => checkOneOf(body.sourceType, 'sourceType', SOURCE_TYPES));
    if (present('protoType')) checks.push(() => checkOneOf(body.protoType, 'protoType', PROTO_TYPES));
    if (body.folder === 'prototypes' && !present('protoType')) {
      checks.push(() => `protoType is required for prototypes (one of: ${PROTO_TYPES.join(', ')})`);
    }
    if (present('description')) checks.push(() => checkBody(body.description, 'description'));
  }

  return firstError(checks);
}

// A frontmatter key this validator has no specific rule for (type-specific
// deliverable fields like scope, segment, study_dates, issues_found, ...).
// Allowed shapes are the ones new_research_session.py writes and the loaders
// read: a scalar, a flat list of strings, or a flat object of strings.
function checkUnknownValue(value, name) {
  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${name} must be a finite number`;
  if (typeof value === 'string') return checkLine(value, name);
  if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === 'string')) return `${name} must be an array of strings, not nested values`;
    return checkItems(value, name);
  }
  if (isPlainObject(value)) {
    for (const [subKey, subValue] of Object.entries(value)) {
      if (!KEY_RE.test(subKey)) return `${name} has an invalid key ${JSON.stringify(subKey)}`;
      if (subValue === null) continue;
      if (typeof subValue !== 'string') return `${name}.${subKey} must be a string or null, not a nested value`;
      const err = checkLine(subValue, `${name}.${subKey}`);
      if (err) return err;
    }
    return null;
  }
  return `${name} has an unsupported type`;
}

function checkPutField(key, value) {
  const name = `frontmatter.${key}`;
  if (!KEY_RE.test(key)) return `frontmatter key ${JSON.stringify(key)} must be snake_case (^[a-z][a-z0-9_]*$)`;
  if (key === 'title') return checkLine(value, name, { max: MAX_TITLE, required: true });
  if (key === 'status') return checkOneOf(value, name, STATUS_OPTIONS);
  if (key === 'source_type') return checkOneOf(value, name, SOURCE_TYPES);
  if (key === 'date') {
    if (typeof value !== 'string' || !isRealDate(normalizeDate(value))) {
      return `${name} must be a real calendar date (YYYY-MM-DD or an ISO timestamp)`;
    }
    return null;
  }
  if (LIST_FIELDS.includes(key)) return checkPutList(value, name);
  if (['researcher', 'designer', 'evaluator', 'reviewed_by'].includes(key)) {
    return value === null ? null : checkLine(value, name, { max: MAX_NAME });
  }
  return checkUnknownValue(value, name);
}

function validateFrontmatterPatch(frontmatter, content) {
  if (content !== undefined && typeof content !== 'string') return 'content must be a string';
  if (frontmatter === undefined) return null;
  if (!isPlainObject(frontmatter)) return 'frontmatter must be an object';
  for (const [key, value] of Object.entries(frontmatter)) {
    const err = checkPutField(key, value);
    if (err) return err;
  }
  return null;
}

// Rewrites every date-bearing value to YYYY-MM-DD, in place: JS Date objects
// (from gray-matter parsing the existing file) and ISO timestamp strings
// (from a client sending those Dates back as JSON). Top-level Dates on any
// key, and strings/Dates under DATE_FIELDS, one level deep.
function normalizeFrontmatterDates(data) {
  const fix = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : normalizeDate(v));
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value instanceof Date) {
      data[key] = fix(value);
    } else if (DATE_FIELDS.includes(key)) {
      if (Array.isArray(value)) data[key] = value.map(fix);
      else if (isPlainObject(value)) data[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fix(v)]));
      else data[key] = fix(value);
    }
  }
  return data;
}

module.exports = {
  SAFE_SLUG_RE,
  STATUS_OPTIONS,
  validateCreate,
  validateFrontmatterPatch,
  normalizeFrontmatterDates,
};
