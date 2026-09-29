// The provenance slot: when the model is shown synthesis or doc records but
// none of the raw sessions they were built from, one of those sessions takes
// the last non-raw slot. A finding's claim ("5 of 6 recognized the flag")
// can then be quoted and cited from the session notes it came from. See
// backend/README.md, "Retrieval", and docs/decisions.md.

const { chunkRecord } = require('./corpus');

const SYNTHESIZED_INTO_RE = /Synthesized into:\s*([a-z0-9-]+)\.md/g;
// A path into research/raw/, in link targets or text:
// "../raw/2026-02-17-session-lock-during-dictation/session-notes.md".
const RAW_PATH_RE = /\braw\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)/g;

// For every record that isn't a raw session, the raw sessions it's linked
// to, as a Map of record id -> Set of raw record ids. Read from whole
// records, metadata sections included (they're only kept out of retrieval),
// by four kinds of link:
//   - a raw session's "Synthesized into: <slug>.md" names finding:<slug>
//   - a record's text or links contain a raw/<date-slug> path
//   - a finding's Evidence Trail names a raw session by its exact title
//   - a raw session's related_components names component:<slug>
// Links to records that aren't in `records` are ignored.
function provenanceLinks(records) {
    const byId = new Map(records.map((r) => [r.id, r]));
    const links = new Map();
    const link = (id, rawId) => {
        const record = byId.get(id);
        const raw = byId.get(rawId);
        if (!record || !raw || record.kind === 'raw' || raw.kind !== 'raw') return;
        if (!links.has(id)) links.set(id, new Set());
        links.get(id).add(rawId);
    };
    const raws = records.filter((r) => r.kind === 'raw');

    for (const record of records) {
        const chunks = chunkRecord(record);
        if (record.kind === 'raw') {
            const text = chunks.map((c) => c.text).join('\n');
            for (const m of text.matchAll(SYNTHESIZED_INTO_RE)) link(`finding:${m[1]}`, record.id);
            for (const slug of record.related_components || []) link(`component:${slug}`, record.id);
            continue;
        }
        for (const m of String(record.html || '').matchAll(RAW_PATH_RE)) link(record.id, `raw:${m[1]}`);
        const trail = chunks.filter((c) => c.heading === 'Evidence Trail').map((c) => c.text).join('\n');
        if (trail) for (const raw of raws) if (trail.includes(raw.title)) link(record.id, raw.id);
    }
    return links;
}

// The records to show, given every in-scope record ranked best first
// (retrieval.js rankRecords) and the links above. The top k, except:
// when none of the top k is a raw session linked to one of the top k's
// non-raw records, the best-ranked such session from below the cut-off
// replaces the lowest-ranked non-raw record, and is shown last. Never
// replaced is a record that is the only one shown linking to the session
// being added (that would show the session without the record it was
// pulled in for). Nothing changes when the top k has no non-raw record,
// already shows a linked session, when no linked session is in scope, or
// when every non-raw record shown is such a sole link.
// The added record is marked { provenance: true }.
function withProvenanceSlot(ranked, k, links) {
    const chosen = ranked.slice(0, k);
    const linkedRaws = new Set();
    for (const r of chosen) {
        if (r.record.kind !== 'raw') for (const id of links.get(r.record.id) || []) linkedRaws.add(id);
    }
    if (chosen.some((r) => linkedRaws.has(r.record.id))) return chosen;
    const candidate = ranked.slice(k).find((r) => linkedRaws.has(r.record.id));
    if (!candidate) return chosen;

    const linkers = chosen.filter((r) => r.record.kind !== 'raw' && (links.get(r.record.id) || new Set()).has(candidate.record.id));
    for (let i = chosen.length - 1; i >= 0; i -= 1) {
        const r = chosen[i];
        if (r.record.kind === 'raw' || (linkers.length === 1 && linkers[0] === r)) continue;
        return [...chosen.slice(0, i), ...chosen.slice(i + 1), { ...candidate, provenance: true }];
    }
    return chosen;
}

module.exports = { provenanceLinks, withProvenanceSlot };
