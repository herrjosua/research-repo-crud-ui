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

// A raw session's correction file, as export_records.py appends it after
// the session's own sections: an <h2> "Correction (YYYY-MM-DD)", and the
// correction's own headings as <h3> "Correction (YYYY-MM-DD): …". A passage
// under either is marked { date }; the pipeline's corrections option
// (ask/pipeline.js) attaches them to a shown session. An ordinary heading
// that only mentions the word ("Corrections to the flow") doesn't match.
const CORRECTION_HEADING_RE = /^Correction \((\d{4}-\d{2}-\d{2})\)(?::|$)/;

function correctionOf(heading) {
    const match = CORRECTION_HEADING_RE.exec(heading || '');
    return match ? { date: match[1] } : null;
}

// Packs a record's blocks into passages of up to MAX_PASSAGE_CHARS, never
// letting one passage straddle two headings (so each passage's section label
// is accurate). Each passage carries `correction`: { date } under a
// correction heading, else null.
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
    return passages.map((passage, index) => ({ ...passage, index, correction: correctionOf(passage.heading) }));
}

// Sections that describe a record rather than hold its evidence: who took
// part, what it links to, where it lives in code. A question about a topic
// matches these on names and titles alone (a roster matches any question
// naming a role; an Evidence Trail matches any question naming a session), so
// they crowded real evidence out of the top k. They're still chunked, so a
// record's text is complete for provenance links (ask/provenance.js) and a
// cited passage's surrounding context, but never embedded or retrieved. A
// raw session's roster reaches the model instead as a one-line header on
// that session's sources (participantsHeader). Per record kind, by heading:
const METADATA_SECTIONS = {
    raw: [/^Participants — /, /^Related$/],
    finding: [/^Evidence Trail$/, /^Related Findings$/],
    component: [/^Code mapping$/, /^Related Research Findings$/],
};
// …plus a raw record's heading-less one-line "Researcher: …" passage (the
// onboarding session has one). The onboarding session's own "Participants"
// section, with no " — <title>", is prose evidence ("6 participants, all
// first-time admins…") and stays retrievable.
const RESEARCHER_LINE_RE = /^Researcher:[^\n]*$/;
// A raw session's own list of what it left open. It's evidence, retrieved
// like any section; the pipeline's followUps option (ask/pipeline.js) also
// attaches it by this heading when a question asks what is unresolved.
const FOLLOW_UPS_HEADING = 'Follow-ups / Open Questions';

function isMetadataPassage(record, passage) {
    if (record.kind === 'raw' && !passage.heading && RESEARCHER_LINE_RE.test(passage.text)) return true;
    return (METADATA_SECTIONS[record.kind] || []).some((re) => re.test(passage.heading || ''));
}

// A raw session's roster (its "Participants — <title>" section) as one line:
//   "Participants: 3 — Care Coordinator ×2, Care Coordinator (float pool) ×1"
// Roles carry a ×n count only when the list has one line per participant;
// most rosters list each role once whatever the head count ("Count: 6" over
// four roles), and there a count would be invented, so the roles are listed
// plainly: "Participants: 6 — Physician, Nurse Practitioner, …". A count
// that isn't a number ("N/A" on the analytics review) is kept as written,
// without roles. null for a record with no roster.
function participantsHeader(record) {
    if (record.kind !== 'raw') return null;
    const blocks = htmlToBlocks(record.html || '').filter((b) => /^Participants — /.test(b.heading || ''));
    if (blocks.length === 0) return null;
    let count = null;
    const roles = [];
    let inRoles = false;
    for (const { text } of blocks) {
        const field = /^([A-Z][A-Za-z ]{0,30}):\s*(.*)$/.exec(text);
        if (field) {
            inRoles = field[1] === 'Roles';
            if (field[1] === 'Count') count = field[2].trim();
            if (inRoles && field[2].trim()) roles.push(field[2].trim());
        } else if (inRoles) {
            roles.push(text);
        }
    }
    if (!count) return null;
    if (!/^\d+$/.test(count)) return `Participants: ${count}`;
    if (roles.length === 0) return `Participants: ${count}`;
    const tally = new Map();
    for (const role of roles) tally.set(role, (tally.get(role) || 0) + 1);
    const onePerParticipant = roles.length === Number(count);
    const list = [...tally].map(([role, n]) => (onePerParticipant ? `${role} ×${n}` : role)).join(', ');
    return `Participants: ${count} — ${list}`;
}

// A raw session's appended participants.md: its "Participants — <title>"
// roster, or the onboarding session's heading-only "Participants" prose.
// Neither is part of the session's notes.
const APPENDED_PARTICIPANTS_RE = /^Participants(?: — |$)/;

// A raw session's whole notes as one text, for the pipeline's wholeRawNotes
// option: its sections in record order, each under its own heading line,
// without the metadata sections (isMetadataPassage) or the appended
// participants. Sections are separated by a line break, not a blank line,
// so the text stays one source block in the prompt.
function wholeNotesText(record) {
    const sections = [];
    for (const chunk of chunkRecord(record)) {
        if (isMetadataPassage(record, chunk) || APPENDED_PARTICIPANTS_RE.test(chunk.heading || '')) continue;
        const last = sections[sections.length - 1];
        if (last && last.heading === chunk.heading) {
            last.lines.push(chunk.text);
        } else {
            sections.push({ heading: chunk.heading, lines: [chunk.text] });
        }
    }
    return sections
        .map(({ heading, lines }) => [...(heading && heading !== record.title ? [heading] : []), ...lines].join('\n'))
        .join('\n');
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
// including edits made a moment ago through PUT /api/records. `summary`
// passes --summary (no html/searchText), for callers that only need tags.
async function loadRecords({ summary = false } = {}) {
    const scriptsDir = path.join(process.env.AGENTIC_REPO_ROOT, 'research', 'scripts');
    const { stdout } = await execFileAsync(
        process.env.PYTHON_BIN || 'python3',
        [path.join(scriptsDir, 'export_records.py'), ...(summary ? ['--summary'] : [])],
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
    CORRECTION_HEADING_RE,
    METADATA_SECTIONS,
    FOLLOW_UPS_HEADING,
    isMetadataPassage,
    participantsHeader,
    wholeNotesText,
    embeddingText,
    queryEmbeddingText,
    clip,
    loadRecords,
};
