const { provenanceLinks, withProvenanceSlot } = require('../ask/provenance');

// Records shaped like export_records.py's, with the link styles the real
// corpus uses: a raw session's "Synthesized into", a finding's Evidence
// Trail (a raw/ link and the session's title), and related_components.
const RAW_A = {
    id: 'raw:2026-02-10-medication-flag',
    kind: 'raw',
    title: 'Usability Test — Medication Flag Concept',
    related_components: ['scribe-widget'],
    html: '<h2>Key Findings</h2><p>5 of 6 recognized the flag.</p>'
        + '<h2>Related</h2><ul><li>Synthesized into: post-ga.md</li></ul>',
};
const RAW_B = {
    id: 'raw:2026-02-17-session-lock',
    kind: 'raw',
    type: 'contextual-inquiry',
    title: 'Contextual Inquiry — Session Lock',
    related_components: [],
    html: '<h2>Key Findings</h2><p>The lock fired mid-dictation.</p>',
};
const RAW_C = {
    id: 'raw:2025-05-20-sso-interview',
    kind: 'raw',
    title: 'Interview — SSO and MFA',
    related_components: [],
    html: '<h2>Key Findings</h2><p>10-minute idle timeout.</p>',
};
const FINDING = {
    id: 'finding:post-ga',
    kind: 'finding',
    title: 'Post-GA refinements',
    html: '<h2>Overview</h2><p>Flag recognized; lock disrupts dictation.</p>'
        + '<h2>Evidence Trail</h2><ul><li>2026-02-17 — <a href="../raw/2026-02-17-session-lock/session-notes.md">Contextual Inquiry — Session Lock</a></li></ul>',
};
const TITLE_ONLY = {
    id: 'finding:security',
    kind: 'finding',
    title: 'Security',
    html: '<h2>Evidence Trail</h2><ul><li>Interview — SSO and MFA</li></ul>'
        // A title outside the Evidence Trail isn't a link.
        + '<h2>Overview</h2><p>See Contextual Inquiry — Session Lock.</p>',
};
const COMPONENT = { id: 'component:scribe-widget', kind: 'component', title: 'Scribe Widget', html: '<h2>Notes</h2><p>x</p>' };
const DOC = { id: 'deliverable:wireframes/flag', kind: 'deliverable', title: 'Flag wireframe', html: '<h2>Overview</h2><p>x</p>' };

const RECORDS = [RAW_A, RAW_B, RAW_C, FINDING, TITLE_ONLY, COMPONENT, DOC];
const LINKS = provenanceLinks(RECORDS);

describe('provenanceLinks', () => {
    it('links each synthesis or doc record to the raw sessions it was built from', () => {
        expect(Object.fromEntries([...LINKS].map(([id, raws]) => [id, [...raws].sort()]))).toEqual({
            // "Synthesized into" from RAW_A, the raw/ link in the Evidence Trail.
            'finding:post-ga': ['raw:2026-02-10-medication-flag', 'raw:2026-02-17-session-lock'],
            // The Evidence Trail title only.
            'finding:security': ['raw:2025-05-20-sso-interview'],
            // RAW_A's related_components.
            'component:scribe-widget': ['raw:2026-02-10-medication-flag'],
        });
    });

    it('reads links from metadata sections, and ignores links to records not loaded', () => {
        // "Synthesized into" sits in the raw session's Related section, which
        // is never retrieved; it still links.
        expect(LINKS.get('finding:post-ga').has(RAW_A.id)).toBe(true);
        const links = provenanceLinks([FINDING]);
        expect(links.size).toBe(0);
    });
});

describe('withProvenanceSlot', () => {
    const r = (record) => ({ record, passages: [], score: 0 });

    it('swaps the lowest non-raw record for the best-ranked session a shown synthesis record was built from', () => {
        const ranked = [r(FINDING), r(DOC), r(COMPONENT), r(RAW_C), r(RAW_B), r(RAW_A)];
        const chosen = withProvenanceSlot(ranked, 3, LINKS);
        // RAW_B outranks RAW_A, and both are linked; COMPONENT, the lowest non-raw, goes.
        expect(chosen.map((c) => c.record.id)).toEqual([FINDING.id, DOC.id, RAW_B.id]);
        expect(chosen.at(-1).provenance).toBe(true);
    });

    it("never drops the only shown record linking to the session it adds", () => {
        // FINDING is the lowest non-raw record shown, but it's the only one
        // linking to RAW_B, so DOC (above it) goes instead.
        const ranked = [r(DOC), r(FINDING), r(RAW_C), r(RAW_B)];
        expect(withProvenanceSlot(ranked, 2, LINKS).map((c) => c.record.id)).toEqual([FINDING.id, RAW_B.id]);
        // With nothing else to drop, nothing changes.
        expect(withProvenanceSlot([r(FINDING), r(RAW_B)], 1, LINKS).map((c) => c.record.id)).toEqual([FINDING.id]);
    });

    it('changes nothing when a linked session is already shown, none is in scope, or nothing shown is synthesis', () => {
        const alreadyShown = [r(FINDING), r(RAW_A), r(DOC), r(RAW_B)];
        expect(withProvenanceSlot(alreadyShown, 3, LINKS)).toEqual(alreadyShown.slice(0, 3));
        const noneInScope = [r(FINDING), r(DOC), r(RAW_C)];
        expect(withProvenanceSlot(noneInScope, 2, LINKS)).toEqual(noneInScope.slice(0, 2));
        const allRaw = [r(RAW_C), r(RAW_B), r(RAW_A)];
        expect(withProvenanceSlot(allRaw, 2, LINKS)).toEqual(allRaw.slice(0, 2));
        // An unlinked raw session shown doesn't count as provenance.
        const unlinkedRaw = [r(FINDING), r(RAW_C), r(DOC), r(RAW_B)];
        expect(withProvenanceSlot(unlinkedRaw, 3, LINKS).map((c) => c.record.id)).toEqual([FINDING.id, RAW_C.id, RAW_B.id]);
    });
});

describe('the pipeline with the provenance slot on', () => {
    // Off by default (RETRIEVAL.provenanceSlot); these tests turn it on.
    const { createAskPipeline, RETRIEVAL, TOP_K } = require('../ask/pipeline');
    const retrieval = { ...RETRIEVAL, provenanceSlot: true };
    const { chunkRecord } = require('../ask/corpus');

    // A finding built from RAW_B, then enough unlinked docs to fill the top k,
    // then RAW_B itself, ranked last by similarity.
    const docs = Array.from({ length: TOP_K }, (_, i) => ({
        id: `deliverable:docs/doc-${i}`, kind: 'deliverable', type: 'wireframes', title: `Doc ${i}`, html: `<h2>Overview</h2><p>doc ${i}</p>`,
    }));
    const records = [FINDING, ...docs, RAW_B];
    const vectorFor = (record) => {
        if (record === FINDING) return [1, 0];
        if (record === RAW_B) return [0, 1];
        return [1, 0.1 * (docs.indexOf(record) + 1)];
    };
    const passages = records.flatMap((record) => chunkRecord(record)
        .filter((chunk) => chunk.heading !== 'Evidence Trail')
        .map((chunk) => ({ record, chunk, vector: vectorFor(record), participants: null, previous: null, next: null })));
    const index = { refresh: async () => ({ passages, records }), embedQuery: async () => [1, 0] };

    it('shows the session a top synthesis record was built from, last, in place of the lowest doc', async () => {
        let prompt = null;
        const ollama = { chatModel: 'test', chat: async (messages) => { prompt = messages[1].content; return 'ok [1]'; } };
        const pipeline = createAskPipeline({ ollama, index, retrieval });

        const shown = (await pipeline.select('q', null)).map(({ passage }) => passage.record.id);
        expect(shown).toEqual([FINDING.id, ...docs.slice(0, TOP_K - 2).map((d) => d.id), RAW_B.id]);
        // rank() is still the plain similarity ranking.
        expect((await pipeline.rank('q', null)).map(({ passage }) => passage.record.id)).toEqual([FINDING.id, ...docs.slice(0, TOP_K - 1).map((d) => d.id)]);

        await pipeline.ask('q', null);
        expect(prompt).toMatch(new RegExp(`\\[${TOP_K}\\] RAW SESSION · contextual inquiry — Contextual Inquiry — Session Lock — Key Findings\\n`));
    });

    it('is off by default: the top k by similarity, unchanged', async () => {
        const ollama = { chatModel: 'test', chat: async () => 'ok' };
        const shown = (await createAskPipeline({ ollama, index }).select('q', null)).map(({ passage }) => passage.record.id);
        expect(RETRIEVAL.provenanceSlot).toBe(false);
        expect(shown).toEqual([FINDING.id, ...docs.slice(0, TOP_K - 1).map((d) => d.id)]);
    });
});

describe('passagesPerRaw: a second passage for raw sessions only', () => {
    const { createAskPipeline, RETRIEVAL } = require('../ask/pipeline');
    const { chunkRecord } = require('../ask/corpus');

    // A raw session whose best passage comes after its second best in the
    // record, and a finding with two passages of its own.
    const session = {
        id: 'raw:2026-02-10-flag', kind: 'raw', type: 'usability-test', title: 'Flag test',
        html: '<h2>Objective</h2><p>objective</p><h2>Key Findings</h2><p>5 of 6 recognized it</p><h2>Quotes</h2><p>a quote</p>',
    };
    const finding = {
        id: 'finding:flag', kind: 'finding', type: 'synthesis', title: 'Flag finding',
        html: '<h2>Overview</h2><p>overview</p><h2>Evidence</h2><p>evidence</p>',
    };
    const scores = {
        'raw:2026-02-10-flag#0': 0.2, 'raw:2026-02-10-flag#1': 0.8, 'raw:2026-02-10-flag#2': 0.9,
        'finding:flag#0': 0.95, 'finding:flag#1': 0.94,
    };
    const passages = [session, finding].flatMap((record) => chunkRecord(record).map((chunk) => {
        const s = scores[`${record.id}#${chunk.index}`];
        return { record, chunk, vector: [s, Math.sqrt(1 - s * s)], participants: null, previous: null, next: null };
    }));
    const index = { refresh: async () => ({ passages, records: [session, finding] }), embedQuery: async () => [1, 0] };
    const shownWith = async (retrieval) => (await createAskPipeline({ ollama: {}, index, retrieval }).select('q', null))
        .map(({ passage }) => `${passage.record.id}#${passage.chunk.index}`);

    it("shows a raw session's two best passages in document order, and one passage for anything else", async () => {
        expect(RETRIEVAL.passagesPerRaw).toBe(2);
        expect(await shownWith(RETRIEVAL)).toEqual([
            'finding:flag#0', // the finding's second passage (#1, 0.94) isn't shown
            'raw:2026-02-10-flag#1', 'raw:2026-02-10-flag#2', // best is #2, but #1 comes first in the record
        ]);
    });

    it('shows one passage per record at passagesPerRaw 1', async () => {
        expect(await shownWith({ ...RETRIEVAL, passagesPerRaw: 1 })).toEqual(['finding:flag#0', 'raw:2026-02-10-flag#2']);
    });
});

describe('wholeRawNotes: whole notes for the top raw sessions', () => {
    const { createAskPipeline, RETRIEVAL } = require('../ask/pipeline');
    const { chunkRecord, wholeNotesText } = require('../ask/corpus');

    // Two raw sessions (a roster and Related list each, like the real ones),
    // one of them ranked below the top k, and three findings.
    const session = (slug, title) => ({
        id: `raw:${slug}`, kind: 'raw', type: 'usability-test', title,
        html: `<h1>${title}</h1><h2>Objective</h2><p>objective of ${slug}</p>`
            + `<h2>Key Findings</h2><ul><li>finding one of ${slug}</li><li>finding two of ${slug}</li></ul>`
            + '<h2>Related</h2><ul><li>Synthesized into: flag.md</li></ul>'
            + `<h2>Participants — ${title}</h2><p>Count: 2</p>`,
    });
    const rawTop = session('2026-02-10-flag', 'Flag test');
    const rawLow = session('2026-02-17-lock', 'Lock test');
    const findings = [0, 1, 2].map((i) => ({
        id: `finding:f${i}`, kind: 'finding', type: 'synthesis', title: `Finding ${i}`, html: `<h2>Overview</h2><p>finding ${i}</p>`,
    }));
    const records = [rawTop, rawLow, ...findings];
    // Ranking: f0, rawTop, f1, f2, rawLow. rawTop's best passage is its Key Findings.
    const scores = {
        'finding:f0': 0.95, 'raw:2026-02-10-flag': 0.9, 'finding:f1': 0.85, 'finding:f2': 0.8, 'raw:2026-02-17-lock': 0.7,
    };
    const passages = records.flatMap((record) => chunkRecord(record)
        .filter((chunk) => !/^(Related|Participants — )/.test(chunk.heading || ''))
        .map((chunk) => {
            const s = scores[record.id] - (chunk.heading === 'Objective' ? 0.01 : 0);
            return {
                record, chunk, vector: [s, Math.sqrt(1 - s * s)], participants: record.kind === 'raw' ? 'Participants: 2' : null, previous: null, next: null,
            };
        }));
    const index = { refresh: async () => ({ passages, records }), embedQuery: async () => [1, 0] };
    const shownWith = async (retrieval) => (await createAskPipeline({ ollama: {}, index, retrieval }).select('q', null))
        .map(({ passage }) => `${passage.record.id}#${passage.chunk.index}`);

    it("is a session's sections in order under their headings, without Related or the appended roster", () => {
        expect(wholeNotesText(rawTop)).toBe([
            'Objective', 'objective of 2026-02-10-flag',
            'Key Findings', 'finding one of 2026-02-10-flag\nfinding two of 2026-02-10-flag',
        ].join('\n'));
    });

    it('leaves out the heading-less Researcher line and a heading-only Participants section', () => {
        const onboarding = {
            id: 'raw:2026-01-19-onboarding', kind: 'raw', title: 'Onboarding',
            html: '<p>Researcher: Priya Patel</p><h2>Session 1 — Jan 19</h2><p>paused at step 3</p><h2>Participants</h2><p>6 participants</p>',
        };
        expect(wholeNotesText(onboarding)).toBe('Session 1 — Jan 19\npaused at step 3');
    });

    it('is off by default: the passages as before', async () => {
        expect(RETRIEVAL.wholeRawNotes).toBe(0);
        expect(await shownWith({ ...RETRIEVAL, topK: 3 })).toEqual(['finding:f0#0', 'raw:2026-02-10-flag#0', 'raw:2026-02-10-flag#1', 'finding:f1#0']);
    });

    it('replaces the raw passages with the whole notes of the top N raw sessions, in ranking order', async () => {
        expect(await shownWith({ ...RETRIEVAL, topK: 3, wholeRawNotes: 1 })).toEqual(['finding:f0#0', 'raw:2026-02-10-flag#notes', 'finding:f1#0']);
        // A session below the top k comes in; the findings stay the top k's.
        expect(await shownWith({ ...RETRIEVAL, topK: 3, wholeRawNotes: 2 }))
            .toEqual(['finding:f0#0', 'raw:2026-02-10-flag#notes', 'finding:f1#0', 'raw:2026-02-17-lock#notes']);
    });

    it('labels the notes once, keeps the roster header, and cites them as one source', async () => {
        let prompt = null;
        const ollama = { chatModel: 'test', chat: async (messages) => { prompt = messages[1].content; return 'It was recognized [2].'; } };
        const result = await createAskPipeline({ ollama, index, retrieval: { ...RETRIEVAL, topK: 3, wholeRawNotes: 1 } }).ask('q', null);
        expect(prompt).toContain(`[2] RAW SESSION · usability test — Flag test\nParticipants: 2\n${wholeNotesText(rawTop)}\n\n[3]`);
        expect(result.sources).toEqual([expect.objectContaining({
            id: 'raw:2026-02-10-flag#notes', excerpt: wholeNotesText(rawTop), section: null, participants: 'Participants: 2', contextBefore: null, contextAfter: null,
        })]);
    });
});
