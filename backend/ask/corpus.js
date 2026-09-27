// Turns export_records.py's records into the passages Ask the Repo embeds and
// cites. The script is the single source of truth for what a record is (same
// as routes/records.js); this file only reshapes its output.

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

// Passages are packed from whole blocks (paragraphs, list items, headings'
// sections) up to about this many characters: long enough to carry a claim
// with its evidence, short enough that a citation's excerpt is specific. A
// single block longer than this becomes its own passage rather than being cut
// mid-sentence.
const MAX_PASSAGE_CHARS = 600;
// How much of the neighbouring passages to show around a cited excerpt
// (the sources panel's contextBefore/contextAfter).
const CONTEXT_CHARS = 400;

// Every record kind/type mapped onto the five display kinds the frontend's
// KindTag knows (frontend/src/ask-the-repo/sources/kindMeta.js). Raw session
// notes are primary evidence, so they map to the pinnable kinds; findings and
// analytics summaries are synthesis; deliverables and components are docs.
function sourceKind(record) {
    if (record.kind === 'raw') {
        if (record.type === 'interview') return 'interview';
        if (record.type === 'survey') return 'survey';
        return 'transcript'; // usability tests, contextual inquiry, audits: session notes
    }
    if (record.kind === 'finding' || record.kind === 'analytics') return 'synthesis';
    return 'doc';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2025-01-14" -> "Jan 14, 2025", the display format the mock sources use.
// Anything that isn't a plain date (components carry prose in `date`) -> null.
function formatDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const [, year, month, day] = match;
    const monthName = MONTHS[Number(month) - 1];
    if (!monthName) return null;
    return `${monthName} ${Number(day)}, ${year}`;
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
        if (name[0] === '#') {
            const code = name[1] === 'x' || name[1] === 'X'
                ? parseInt(name.slice(2), 16)
                : parseInt(name.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
        }
        return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    });
}

// Splits md_render.py's HTML into plain-text blocks, each tagged with the
// heading it sits under. Block-level closing tags become breaks; every other
// tag is dropped; entities are decoded.
function htmlToBlocks(html) {
    const blocks = [];
    let heading = null;
    const tokenRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>|<(p|li|blockquote|pre|tr)[^>]*>([\s\S]*?)<\/\3>/gi;
    let match;
    while ((match = tokenRe.exec(html)) !== null) {
        const isHeading = Boolean(match[1]);
        const text = cleanInline(isHeading ? match[2] : match[4]);
        if (!text) continue;
        if (isHeading) {
            heading = text;
        } else {
            blocks.push({ heading, text });
        }
    }
    return blocks;
}

function cleanInline(fragment) {
    return decodeEntities(fragment.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Packs a record's blocks into passages of up to MAX_PASSAGE_CHARS, never
// letting one passage straddle two headings (so each passage's section label
// is accurate).
function chunkRecord(record) {
    const passages = [];
    let current = null;
    for (const block of htmlToBlocks(record.html || '')) {
        const fits = current
            && current.heading === block.heading
            && current.text.length + 1 + block.text.length <= MAX_PASSAGE_CHARS;
        if (fits) {
            current.text += `\n${block.text}`;
        } else {
            current = { heading: block.heading, text: block.text };
            passages.push(current);
        }
    }
    return passages.map((passage, index) => ({ ...passage, index }));
}

// Text actually sent to the embedding model for a passage. nomic-embed-text
// is trained with task prefixes ("search_document: " for corpus text,
// "search_query: " for questions) and retrieves noticeably worse without
// them. The title and section are included so a passage like "3 of 5
// participants abandoned" still carries what it's about.
function embeddingText(record, passage) {
    const section = passage.heading && passage.heading !== record.title ? ` — ${passage.heading}` : '';
    return `search_document: ${record.title}${section}\n${passage.text}`;
}

function queryEmbeddingText(question) {
    return `search_query: ${question}`;
}

// Trims to at most `max` characters on a word boundary, from the start or
// (fromEnd) the end, marking the cut with an ellipsis.
function clip(text, max, { fromEnd = false } = {}) {
    if (!text || text.length <= max) return text || '';
    if (fromEnd) {
        const tail = text.slice(text.length - max);
        const space = tail.indexOf(' ');
        return `…${space === -1 ? tail : tail.slice(space + 1)}`;
    }
    const head = text.slice(0, max);
    const space = head.lastIndexOf(' ');
    return `${space === -1 ? head : head.slice(0, space)}…`;
}

// Loads every record by shelling out to export_records.py, exactly like
// GET /api/records. Read fresh on every call (~0.1s for the whole corpus), so
// Ask the Repo always sees the same records the rest of the app does,
// including edits made a moment ago through PUT /api/records.
async function loadRecords() {
    const scriptsDir = path.join(process.env.AGENTIC_REPO_ROOT, 'research', 'scripts');
    const { stdout } = await execFileAsync(
        process.env.PYTHON_BIN || 'python3',
        [path.join(scriptsDir, 'export_records.py')],
        {
            cwd: scriptsDir,
            // See PYTHON_ENV in routes/records.js for why.
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
            maxBuffer: 64 * 1024 * 1024,
        },
    );
    return JSON.parse(stdout);
}

module.exports = {
    MAX_PASSAGE_CHARS,
    CONTEXT_CHARS,
    sourceKind,
    formatDate,
    decodeEntities,
    htmlToBlocks,
    chunkRecord,
    embeddingText,
    queryEmbeddingText,
    clip,
    loadRecords,
};
