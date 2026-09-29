// The Ask the Repo evaluation gold set (ask/eval/gold.json), read by
// scripts/eval-ask.js. Kept apart from ask/static/questions.json so the
// public demo's question list isn't tied to what the harness measures.
//
//   {
//     version: 1,
//     entries: [{
//       id, question, project,  // as in questions.json; project is a project-* tag or null
//       set,                    // "regression" (questions the pipeline has got wrong before, to catch
//                               // them coming back) or "scenario" (realistic researcher questions,
//                               // including ones that test new behaviors); reports count each apart
//       status,                 // "draft" until a person has reviewed the entry, then "reviewed"
//       supportingRecords,      // record ids that support a correct answer; a passing run cites one
//       requiredRawRecord,      // the raw session a passing run must cite, or null when no raw
//                               // session holds the answer; one of supportingRecords
//       mustClaims,             // [{ description, pattern }]: each must match the answer
//       mustNotClaims,          // [{ description, pattern }]: none may match the answer
//       acceptDecline,          // optional, default false: true when the corpus can't answer the
//                               // question, so a decline citing nothing may skip the
//                               // supporting-record rule (every other rule still applies)
//       evidence,               // where the entry comes from, for the reviewer
//     }],
//   }
//
// A pattern is a case-insensitive regular expression matched against the
// answer with its [n] markers removed and curly quotes straightened.

const fs = require('fs');
const path = require('path');
const { SAFE_SLUG_RE } = require('../../validation');

const GOLD_FILE = path.join(__dirname, 'gold.json');
const GOLD_STATUSES = ['draft', 'reviewed'];
const GOLD_SETS = ['regression', 'scenario'];
// ask/corpus.js record ids: "<kind>:<path or slug>".
const RECORD_ID_RE = /^(raw|finding|component|analytics|deliverable):[a-z0-9][a-z0-9/._-]*$/;

function isProjectOrNull(value) {
    return value === null || (typeof value === 'string' && /^project-[a-z0-9-]+$/.test(value));
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function claimProblems(claims, at) {
    if (!Array.isArray(claims)) return [`${at} must be an array`];
    const problems = [];
    claims.forEach((claim, i) => {
        const where = `${at}[${i}]`;
        if (!claim || !nonEmptyString(claim.description)) problems.push(`${where}.description must be a non-empty string`);
        if (!claim || !nonEmptyString(claim.pattern)) {
            problems.push(`${where}.pattern must be a non-empty string`);
            return;
        }
        try {
            new RegExp(claim.pattern, 'i');
        } catch (err) {
            problems.push(`${where}.pattern is not a valid regular expression: ${err.message}`);
        }
    });
    return problems;
}

// Problems with a gold file, as strings; [] when it's valid.
function validateGold(data) {
    if (!data || typeof data !== 'object') return ['must be an object'];
    const problems = [];
    if (data.version !== 1) problems.push('version must be 1');
    if (!Array.isArray(data.entries) || data.entries.length === 0) return [...problems, 'entries must be a non-empty array'];

    const seen = new Set();
    data.entries.forEach((entry, i) => {
        const at = `entries[${i}]${entry && entry.id ? ` (${entry.id})` : ''}`;
        if (!entry || typeof entry !== 'object') {
            problems.push(`${at}: must be an object`);
            return;
        }
        if (typeof entry.id !== 'string' || !SAFE_SLUG_RE.test(entry.id)) {
            problems.push(`${at}: id must match ^[a-z0-9-]+$`);
        } else if (seen.has(entry.id)) {
            problems.push(`${at}: duplicate id`);
        } else {
            seen.add(entry.id);
        }
        if (!nonEmptyString(entry.question)) problems.push(`${at}: question must be a non-empty string`);
        if (!isProjectOrNull(entry.project)) problems.push(`${at}: project must be a project-* tag or null`);
        if (!GOLD_SETS.includes(entry.set)) problems.push(`${at}: set must be one of ${GOLD_SETS.join(', ')}`);
        if (!GOLD_STATUSES.includes(entry.status)) problems.push(`${at}: status must be one of ${GOLD_STATUSES.join(', ')}`);
        if (!nonEmptyString(entry.evidence)) problems.push(`${at}: evidence must be a non-empty string`);

        const records = entry.supportingRecords;
        if (!Array.isArray(records) || records.length === 0) {
            problems.push(`${at}: supportingRecords must be a non-empty array`);
        } else {
            records.forEach((id, j) => {
                if (typeof id !== 'string' || !RECORD_ID_RE.test(id)) problems.push(`${at}: supportingRecords[${j}] is not a record id`);
            });
            if (new Set(records).size !== records.length) problems.push(`${at}: supportingRecords has duplicates`);
        }

        if (entry.requiredRawRecord !== null) {
            if (typeof entry.requiredRawRecord !== 'string' || !entry.requiredRawRecord.startsWith('raw:')) {
                problems.push(`${at}: requiredRawRecord must be a raw: record id or null`);
            } else if (Array.isArray(records) && !records.includes(entry.requiredRawRecord)) {
                problems.push(`${at}: requiredRawRecord must be one of supportingRecords`);
            }
        }

        if ('acceptDecline' in entry && typeof entry.acceptDecline !== 'boolean') {
            problems.push(`${at}: acceptDecline must be true or false when present`);
        }

        problems.push(...claimProblems(entry.mustClaims, `${at}: mustClaims`));
        problems.push(...claimProblems(entry.mustNotClaims, `${at}: mustNotClaims`));
        if (Array.isArray(entry.mustClaims) && Array.isArray(entry.mustNotClaims)
            && entry.mustClaims.length + entry.mustNotClaims.length === 0) {
            problems.push(`${at}: needs at least one mustClaims or mustNotClaims entry`);
        }
    });
    return problems;
}

function loadGold(file = GOLD_FILE) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const problems = validateGold(data);
    if (problems.length > 0) throw new Error(`${file} is invalid:\n  ${problems.join('\n  ')}`);
    return data;
}

module.exports = { GOLD_FILE, GOLD_STATUSES, GOLD_SETS, validateGold, loadGold };
