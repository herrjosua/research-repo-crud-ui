// The static demo's captured answers (LLM_PROVIDER=static).
//
// ask/static/questions.json is the curated list the capture script reads:
//   [{ id, question, project }]   project: a project-* tag, or null for all
// ask/static/answers.json is what the script publishes and the server serves:
//   {
//     metadata: {
//       model, embedModel,   // the Ollama models that produced the answers
//       capturedAt,          // ISO timestamp of the capture run
//       corpusCommit,        // agentic-repo HEAD the answers were captured against
//       scriptVersion,       // CAPTURE_SCRIPT_VERSION when captured
//     },
//     questions: [{
//       id, question, project,
//       answer, sources,     // verbatim from the pipeline, as POST /api/ask returns them
//       run,                 // which of the question's capture runs this is
//     }],
//   }
// See scripts/capture-static-answers.js and backend/README.md.

const fs = require('fs');
const path = require('path');
const { SAFE_SLUG_RE } = require('../validation');

const STATIC_DIR = path.join(__dirname, 'static');
const QUESTIONS_FILE = path.join(STATIC_DIR, 'questions.json');
const ANSWERS_FILE = path.join(STATIC_DIR, 'answers.json');

// Bump when the capture script changes what it writes or how it runs the
// pipeline, so a published file records which version produced it.
const CAPTURE_SCRIPT_VERSION = 1;

const SOURCE_KEYS = [
    'id', 'kind', 'title', 'excerpt', 'project', 'recordProject', 'date', 'contextBefore',
    'contextAfter', 'section', 'recordId', 'recordKind', 'recordType', 'score',
];

// Every [n] marker in an answer, as numbers, in order.
function citationMarkers(answer) {
    return [...String(answer).matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
}

function isProjectOrNull(value) {
    return value === null || (typeof value === 'string' && /^project-[a-z0-9-]+$/.test(value));
}

// Problems with a curated questions list, as strings; [] when it's valid.
function validateQuestionList(list) {
    if (!Array.isArray(list) || list.length === 0) return ['must be a non-empty array'];
    const problems = [];
    const seen = new Set();
    list.forEach((entry, i) => {
        const at = `[${i}]${entry && entry.id ? ` (${entry.id})` : ''}`;
        if (!entry || typeof entry.id !== 'string' || !SAFE_SLUG_RE.test(entry.id)) {
            problems.push(`${at}: id must match ^[a-z0-9-]+$`);
        } else if (seen.has(entry.id)) {
            problems.push(`${at}: duplicate id`);
        } else {
            seen.add(entry.id);
        }
        if (!entry || typeof entry.question !== 'string' || !entry.question.trim()) {
            problems.push(`${at}: question must be a non-empty string`);
        }
        if (!entry || !isProjectOrNull(entry.project)) {
            problems.push(`${at}: project must be a project-* tag or null`);
        }
    });
    return problems;
}

// Problems with a published answers file, as strings; [] when it's valid.
function validateStaticAnswers(data) {
    if (!data || typeof data !== 'object') return ['must be an object'];
    const problems = [];

    const meta = data.metadata || {};
    if (typeof meta.model !== 'string' || !meta.model) problems.push('metadata.model must be a non-empty string');
    if (typeof meta.embedModel !== 'string' || !meta.embedModel) problems.push('metadata.embedModel must be a non-empty string');
    if (typeof meta.capturedAt !== 'string' || Number.isNaN(Date.parse(meta.capturedAt))) {
        problems.push('metadata.capturedAt must be an ISO timestamp');
    }
    if (typeof meta.corpusCommit !== 'string' || !/^[0-9a-f]{40}$/.test(meta.corpusCommit)) {
        problems.push('metadata.corpusCommit must be a full git commit hash');
    }
    if (!Number.isInteger(meta.scriptVersion) || meta.scriptVersion < 1 || meta.scriptVersion > CAPTURE_SCRIPT_VERSION) {
        problems.push(`metadata.scriptVersion must be an integer from 1 to ${CAPTURE_SCRIPT_VERSION}`);
    }

    const questionProblems = validateQuestionList(data.questions);
    problems.push(...questionProblems.map((p) => `questions${p.startsWith('[') ? '' : ' '}${p}`));
    if (!Array.isArray(data.questions)) return problems;

    data.questions.forEach((entry, i) => {
        if (!entry) return;
        const at = `questions[${i}]${entry.id ? ` (${entry.id})` : ''}`;
        if (typeof entry.answer !== 'string' || !entry.answer.trim()) {
            problems.push(`${at}: answer must be a non-empty string`);
            return;
        }
        if (!Array.isArray(entry.sources)) {
            problems.push(`${at}: sources must be an array`);
            return;
        }
        if (!Number.isInteger(entry.run) || entry.run < 1) {
            problems.push(`${at}: run must be a positive integer`);
        }
        const markers = citationMarkers(entry.answer);
        if (markers.length > 0 && entry.sources.length === 0) {
            problems.push(`${at}: the answer cites sources but sources is empty`);
        }
        const beyond = markers.filter((n) => n < 1 || n > entry.sources.length);
        if (beyond.length > 0) {
            problems.push(`${at}: ${beyond.map((n) => `[${n}]`).join(', ')} beyond its ${entry.sources.length} source(s)`);
        }
        entry.sources.forEach((source, j) => {
            const missing = SOURCE_KEYS.filter((key) => !source || !(key in source));
            if (missing.length > 0) problems.push(`${at}: sources[${j}] is missing ${missing.join(', ')}`);
            if (source && source.project !== entry.project) {
                problems.push(`${at}: sources[${j}].project doesn't match the question's project`);
            }
            if (!markers.includes(j + 1)) problems.push(`${at}: sources[${j}] is never cited`);
        });
    });
    return problems;
}

// Reads and validates a published answers file, throwing (so the server
// refuses to start) if it's missing or malformed.
function loadStaticAnswers(file = ANSWERS_FILE) {
    let data;
    try {
        data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        throw new Error(`LLM_PROVIDER=static needs a valid answers file at ${file}: ${err.message}`);
    }
    const problems = validateStaticAnswers(data);
    if (problems.length > 0) {
        throw new Error(`LLM_PROVIDER=static: ${file} is invalid:\n  ${problems.join('\n  ')}`);
    }
    return {
        metadata: data.metadata,
        questions: data.questions,
        byId: new Map(data.questions.map((entry) => [entry.id, entry])),
    };
}

module.exports = {
    STATIC_DIR,
    QUESTIONS_FILE,
    ANSWERS_FILE,
    CAPTURE_SCRIPT_VERSION,
    citationMarkers,
    validateQuestionList,
    validateStaticAnswers,
    loadStaticAnswers,
};
