const { cosineSimilarity, rankPassages, createEmbeddingIndex } = require('../ask/retrieval');
const {
    MAX_PASSAGE_CHARS, sourceKind, formatDate, decodeEntities, htmlToBlocks, chunkRecord, clip,
    isMetadataPassage, participantsHeader, CORRECTION_HEADING_RE,
} = require('../ask/corpus');
const { toPlainText } = require('../ask/plainText');
const {
    renumberCitations, sourceLabel, sourceClass, buildMessages, toSource, CORRECTIONS_RULE,
} = require('../ask/answer');
const { resolveProvider } = require('../ask/config');

describe('cosineSimilarity', () => {
    it('is 1 for identical direction regardless of magnitude', () => {
        expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
        expect(cosineSimilarity([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    });

    it('is 0 for orthogonal and -1 for opposite vectors', () => {
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
        expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
    });

    it('scores a closer vector higher', () => {
        const query = [1, 1, 0];
        expect(cosineSimilarity(query, [1, 0.9, 0.1])).toBeGreaterThan(cosineSimilarity(query, [1, 0, 1]));
    });

    it('returns 0 for a zero vector instead of NaN', () => {
        expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });

    it('throws on mismatched dimensions (e.g. a model swap mid-cache)', () => {
        expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
    });
});

describe('rankPassages', () => {
    const recordA = { id: 'a' };
    const recordB = { id: 'b' };
    const recordC = { id: 'c' };
    const passages = [
        { record: recordA, vector: [1, 0], label: 'a-exact' },
        { record: recordA, vector: [0.9, 0.1], label: 'a-close' },
        { record: recordB, vector: [0.5, 0.5], label: 'b' },
        { record: recordC, vector: [0, 1], label: 'c' },
    ];

    it('keeps only the best passage per record, best record first', () => {
        const ranked = rankPassages([1, 0], passages, 10);
        expect(ranked.map((r) => r.passage.label)).toEqual(['a-exact', 'b', 'c']);
        expect(ranked[0].score).toBeCloseTo(1);
    });

    it('returns at most k records', () => {
        expect(rankPassages([1, 0], passages, 2).map((r) => r.passage.record.id)).toEqual(['a', 'b']);
    });
});

describe('createEmbeddingIndex', () => {
    const record = (id, paragraphs) => ({
        id,
        title: `Title ${id}`,
        html: paragraphs.map((p) => `<p>${p}</p>`).join('\n'),
    });
    // Each paragraph is long enough to be its own passage.
    const long = (word) => `${word} `.repeat(Math.ceil(MAX_PASSAGE_CHARS / (word.length + 1)));

    function setup(initialRecords) {
        let records = initialRecords;
        const embed = jest.fn(async (texts) => texts.map((t) => [t.length, 1]));
        const index = createEmbeddingIndex({ embed, loadRecords: async () => records, batchSize: 2 });
        return { index, embed, setRecords: (next) => { records = next; } };
    }

    it('embeds every passage on the first refresh, in batches, with the document prefix', async () => {
        const { index, embed } = setup([record('a', [long('one'), long('two')]), record('b', [long('three')])]);

        const { passages, embedded } = await index.refresh();

        expect(embedded).toBe(3);
        expect(passages).toHaveLength(3);
        expect(embed).toHaveBeenCalledTimes(2); // batchSize 2: [2, 1]
        expect(embed.mock.calls.flat(2).every((t) => t.startsWith('search_document: Title '))).toBe(true);
        expect(passages.every((p) => Array.isArray(p.vector))).toBe(true);
    });

    it('embeds nothing on a refresh when the corpus is unchanged', async () => {
        const { index, embed } = setup([record('a', [long('one')])]);
        await index.refresh();
        embed.mockClear();

        const { embedded, passages } = await index.refresh();

        expect(embedded).toBe(0);
        expect(embed).not.toHaveBeenCalled();
        expect(passages[0].vector).toBeDefined();
    });

    it('re-embeds only changed passages and drops removed ones from the cache', async () => {
        const { index, embed, setRecords } = setup([
            record('a', [long('one'), long('two')]),
            record('b', [long('three')]),
        ]);
        await index.refresh();
        expect(index.size).toBe(3);
        embed.mockClear();

        setRecords([record('a', [long('one'), long('changed')])]);
        const { embedded } = await index.refresh();

        expect(embedded).toBe(1);
        expect(embed.mock.calls[0][0][0]).toMatch(/changed/);
        expect(index.size).toBe(2);
    });

    it('does not embed the same new passages twice when refreshes overlap', async () => {
        const { index, embed } = setup([record('a', [long('one')]), record('b', [long('two')])]);

        await Promise.all([index.refresh(), index.refresh(), index.refresh()]);

        expect(embed.mock.calls.flat(2)).toHaveLength(2);
    });

    it('recovers after a failed refresh', async () => {
        const { index, embed } = setup([record('a', [long('one')])]);
        embed.mockRejectedValueOnce(new Error('ollama down'));

        await expect(index.refresh()).rejects.toThrow('ollama down');
        await expect(index.refresh()).resolves.toMatchObject({ embedded: 1 });
    });

    it('never embeds or returns metadata passages, but keeps them in the record for provenance', async () => {
        const session = rawSession();
        const { index, embed } = setup([session]);

        const { passages, records, embedded } = await index.refresh();

        expect(embedded).toBe(1);
        expect(passages.map((p) => p.chunk.heading)).toEqual(['Key Findings']);
        expect(embed.mock.calls.flat(2).some((t) => /Participants|Synthesized into/.test(t))).toBe(false);
        expect(records[0].html).toMatch(/Synthesized into/);
        // The roster rides on the session's passages instead, and a passage's
        // context is its real neighbour in the record.
        expect(passages[0].participants).toBe('Participants: 3 — Care Coordinator ×2, Care Coordinator (float pool) ×1');
        expect(passages[0].next.heading).toBe('Related');
    });

    it('embeds questions with the query prefix', async () => {
        const { index, embed } = setup([]);
        await index.embedQuery('why?');
        expect(embed).toHaveBeenCalledWith(['search_query: why?']);
    });
});

describe('htmlToBlocks / chunkRecord', () => {
    it('extracts text blocks tagged with their heading, decoding entities and dropping inline tags', () => {
        const html = '<h1>Doc</h1><p>Intro &amp; <strong>bold</strong></p><h2>Findings</h2>'
            + '<ul><li><em>(a)</em> first &quot;quote&quot;</li><li>second</li></ul>';
        expect(htmlToBlocks(html)).toEqual([
            { heading: 'Doc', text: 'Intro & bold' },
            { heading: 'Findings', text: '(a) first "quote"' },
            { heading: 'Findings', text: 'second' },
        ]);
    });

    it('packs blocks under one heading into passages up to the size limit, never across headings', () => {
        const para = 'x'.repeat(250);
        const html = `<h2>A</h2><p>${para}</p><p>${para}</p><p>${para}</p><h2>B</h2><p>short</p>`;

        const passages = chunkRecord({ html });

        expect(passages.map((p) => [p.index, p.heading, p.text.length])).toEqual([
            [0, 'A', 501],
            [1, 'A', 250],
            [2, 'B', 5],
        ]);
        expect(passages.every((p) => p.text.length <= MAX_PASSAGE_CHARS)).toBe(true);
    });

    it('decodes numeric entities and leaves unknown ones alone', () => {
        expect(decodeEntities('&#39;a&#x27;&nbsp;&unknown;')).toBe("'a' &unknown;");
    });
});

// A raw session as export_records.py renders it: session notes, then the
// participants file (its own h1), as in the real corpus.
function rawSession({ count = '3', roles = ['Care Coordinator', 'Care Coordinator', 'Care Coordinator (float pool)'] } = {}) {
    return {
        id: 'raw:2025-01-29-chart-review',
        kind: 'raw',
        type: 'contextual-inquiry',
        title: 'Chart Review Baseline',
        html: [
            '<h1>Chart Review Baseline</h1>',
            '<h2>Key Findings</h2><ul><li>3 of 3 coordinators cross-referenced four systems.</li></ul>',
            '<h2>Related</h2><ul><li>Synthesized into: <a href="../../findings/care-coordination-triage.md">care-coordination-triage.md</a></li></ul>',
            '<h1>Participants — Chart Review Baseline</h1>',
            `<p><strong>Count:</strong> ${count}</p>`,
            '<p><strong>Roles:</strong></p>',
            `<ul>${roles.map((r) => `<li>${r}</li>`).join('')}</ul>`,
            '<p><strong>Researcher:</strong> Priya Patel</p>',
            '<p><strong>Recruitment note:</strong> Participants recruited via internal contacts.</p>',
        ].join('\n'),
    };
}

describe('isMetadataPassage', () => {
    const meta = (record) => chunkRecord(record).filter((p) => isMetadataPassage(record, p)).map((p) => p.heading);

    it("keeps a raw session's roster and Related list out, and its evidence in", () => {
        const record = rawSession();
        expect(meta(record)).toEqual(['Related', 'Participants — Chart Review Baseline']);
        expect(chunkRecord(record).filter((p) => !isMetadataPassage(record, p)).map((p) => p.heading)).toEqual(['Key Findings']);
    });

    it('excludes each kind\'s own link and mapping sections only', () => {
        const html = ['Overview', 'Evidence Trail', 'Related Findings', 'Code mapping', 'Related Research Findings']
            .map((h) => `<h2>${h}</h2><p>${h} text</p>`).join('');
        expect(meta({ kind: 'finding', html })).toEqual(['Evidence Trail', 'Related Findings']);
        expect(meta({ kind: 'component', html })).toEqual(['Code mapping', 'Related Research Findings']);
        // A deliverable's "Related Findings" isn't in the list: it stays retrievable.
        expect(meta({ kind: 'deliverable', html })).toEqual([]);
    });

    it("excludes a raw session's heading-less Researcher line but keeps a plain Participants section", () => {
        const record = {
            kind: 'raw',
            html: '<p>Researcher: Priya Patel</p><h2>Participants</h2><p>6 participants, all first-time workspace admins.</p>',
        };
        expect(meta(record)).toEqual([null]);
        expect(chunkRecord(record).filter((p) => !isMetadataPassage(record, p)).map((p) => p.text))
            .toEqual(['6 participants, all first-time workspace admins.']);
    });
});

describe('participantsHeader', () => {
    it('counts each role when the roster lists one line per participant', () => {
        expect(participantsHeader(rawSession())).toBe('Participants: 3 — Care Coordinator ×2, Care Coordinator (float pool) ×1');
    });

    it('lists roles without counts when they do not add up to the head count', () => {
        expect(participantsHeader(rawSession({ count: '6', roles: ['Physician', 'Physician', 'Nurse Practitioner'] })))
            .toBe('Participants: 6 — Physician, Nurse Practitioner');
    });

    it('keeps a count that is not a number as written, and is null without a roster', () => {
        expect(participantsHeader(rawSession({ count: 'N/A', roles: [] }))).toBe('Participants: N/A');
        expect(participantsHeader({ kind: 'raw', html: '<h2>Key Findings</h2><p>x</p>' })).toBeNull();
        expect(participantsHeader({ ...rawSession(), kind: 'finding' })).toBeNull();
    });
});

// A raw session with a correction file, as export_records.py renders it:
// the notes, the participants file, then one block per correction, its
// own headings prefixed and its <h1> dropped.
function correctedSession() {
    return {
        ...rawSession(),
        html: [
            rawSession().html,
            '<h2>Correction (2026-09-27)</h2>',
            '<p>Filed 2026-09-27 as <code>correction-2026-09-27.md</code> in this session\'s folder. The original notes above are unchanged.</p>',
            '<h3>Correction (2026-09-27): Participant count</h3>',
            '<p><strong>Correct count:</strong> 3 coordinators, not 4.</p>',
            '<h3>Correction (2026-09-27): Cross-referencing</h3>',
            '<p>All 3 coordinators cross-referenced four systems.</p>',
        ].join('\n'),
    };
}

describe('correction passages', () => {
    it('marks passages under a correction heading with its date, keeping their section labels and retrievable', () => {
        const record = correctedSession();
        const corrections = chunkRecord(record).filter((p) => p.correction);
        expect(corrections.map((p) => [p.index, p.heading, p.correction])).toEqual([
            [3, 'Correction (2026-09-27)', { date: '2026-09-27' }],
            [4, 'Correction (2026-09-27): Participant count', { date: '2026-09-27' }],
            [5, 'Correction (2026-09-27): Cross-referencing', { date: '2026-09-27' }],
        ]);
        expect(corrections.some((p) => isMetadataPassage(record, p))).toBe(false);
        // The session's own passages are as they were, indexes included.
        expect(chunkRecord(record).slice(0, 3)).toEqual(chunkRecord(rawSession()));
    });

    it('marks every passage of a record without one null', () => {
        const passages = chunkRecord(rawSession());
        expect(passages.length).toBeGreaterThan(0);
        expect(passages.every((p) => p.correction === null)).toBe(true);
    });

    it('matches the <h2> label and a prefixed <h3> label, not a heading that only mentions corrections', () => {
        expect(CORRECTION_HEADING_RE.exec('Correction (2026-09-27)')[1]).toBe('2026-09-27');
        expect(CORRECTION_HEADING_RE.exec('Correction (2026-09-27): Participant count')[1]).toBe('2026-09-27');
        for (const heading of ['Corrections to the flow', 'Correction', 'Correction of the count', 'Error correction (2026-09-27)', 'Correction (Sept 27)', 'Correction (2026-09-27) notes']) {
            expect(CORRECTION_HEADING_RE.test(heading)).toBe(false);
        }
    });

    const shown = (record, chunk) => ({ passage: { record, chunk, previous: null, next: null, participants: null }, score: 0.5 });

    it('adds the corrections rule to the prompt, and labels the passage by its section, only when a correction is shown', () => {
        const record = correctedSession();
        const [findings, , , filed, count] = chunkRecord(record);
        const [system, user] = buildMessages('How many?', [shown(record, findings), shown(record, count)]);
        expect(system.content).toContain(CORRECTIONS_RULE);
        expect(user.content).toContain('[2] RAW SESSION · contextual inquiry — Chart Review Baseline — Correction (2026-09-27): Participant count\n');
        expect(buildMessages('How many?', [shown(record, filed)])[0].content).toContain(CORRECTIONS_RULE);
        expect(buildMessages('How many?', [shown(record, findings)])[0].content).not.toContain(CORRECTIONS_RULE);
        expect(CORRECTIONS_RULE).toBe('A source labelled "Correction (date)" corrects the original notes of the same session: where they disagree, the correction is right. Use the corrected fact and cite the correction.');
    });

    it('passes the correction through toSource', () => {
        const record = correctedSession();
        const [findings, , , , count] = chunkRecord(record);
        expect(toSource(shown(record, count), null)).toMatchObject({
            id: `${record.id}#4`, section: 'Correction (2026-09-27): Participant count', correction: { date: '2026-09-27' },
        });
        expect(toSource(shown(record, findings), null).correction).toBeNull();
    });
});

describe('sourceKind', () => {
    it.each([
        [{ kind: 'raw', type: 'interview' }, 'interview'],
        [{ kind: 'raw', type: 'survey' }, 'survey'],
        [{ kind: 'raw', type: 'usability-test' }, 'transcript'],
        [{ kind: 'raw', type: 'contextual-inquiry' }, 'transcript'],
        [{ kind: 'finding', type: 'synthesis' }, 'synthesis'],
        [{ kind: 'analytics', type: 'synthesis' }, 'synthesis'],
        [{ kind: 'deliverable', type: 'personas' }, 'doc'],
        [{ kind: 'component', type: 'component' }, 'doc'],
    ])('maps %j to %s', (record, kind) => {
        expect(sourceKind(record)).toBe(kind);
    });
});

describe('sourceLabel', () => {
    it.each([
        [{ kind: 'raw', type: 'usability-test', date: '2025-02-25', title: 'Scribe v0.1' }, { heading: 'Key Findings' },
            'RAW SESSION · usability test · Feb 25, 2025 — Scribe v0.1 — Key Findings'],
        [{ kind: 'raw', type: 'interview', date: '2025-01-14', title: 'Kickoff' }, { heading: 'Kickoff' },
            'RAW SESSION · interview · Jan 14, 2025 — Kickoff'],
        [{ kind: 'finding', type: 'synthesis', date: '2026-02-17', title: 'Ambient AI Scribe' }, { heading: 'Overview' },
            'SYNTHESIS · Feb 17, 2026 — Ambient AI Scribe — Overview'],
        [{ kind: 'analytics', type: 'synthesis', date: '2026-01-27', title: 'Funnel' }, { heading: null },
            'SYNTHESIS · Jan 27, 2026 — Funnel'],
        [{ kind: 'deliverable', type: 'user-flows', date: '2026-01-20', title: 'Onboarding flow' }, { heading: 'Steps' },
            'DOC · user flows · Jan 20, 2026 — Onboarding flow — Steps'],
        [{ kind: 'component', type: 'component', date: 'Figma (via sync_figma_tokens.py)', title: 'Alert Badge' }, { heading: 'States' },
            'DOC · component — Alert Badge — States'],
    ])('labels %j as its class, method and date, title and section', (record, chunk, label) => {
        expect(sourceLabel(record, chunk)).toBe(label);
    });

    it('classes raw sessions, synthesis and docs', () => {
        expect(['raw', 'finding', 'analytics', 'deliverable', 'component'].map((kind) => sourceClass({ kind })))
            .toEqual(['RAW SESSION', 'SYNTHESIS', 'SYNTHESIS', 'DOC', 'DOC']);
    });
});

describe('formatDate', () => {
    it('formats ISO dates like the mock sources', () => {
        expect(formatDate('2025-01-14')).toBe('Jan 14, 2025');
        expect(formatDate('2026-09-03T10:00:00Z')).toBe('Sep 3, 2026');
    });

    it('returns null for non-dates', () => {
        expect(formatDate('Figma (via sync_figma_tokens.py)')).toBeNull();
        expect(formatDate(undefined)).toBeNull();
        expect(formatDate('2025-13-01')).toBeNull();
    });
});

describe('clip', () => {
    it('trims on a word boundary from the start or end', () => {
        expect(clip('alpha beta gamma', 11)).toBe('alpha beta…');
        expect(clip('alpha beta gamma', 11, { fromEnd: true })).toBe('…beta gamma');
        expect(clip('short', 10)).toBe('short');
    });
});

describe('toPlainText', () => {
    it('unwraps markdown emphasis, headings, code, links and quotes', () => {
        const input = [
            '# Heading',
            '**Bold** and __also bold__, *italic* and _italic_, `code`.',
            'See [the readout](https://example.com) and ![chart](x.png).',
            '> quoted line',
            '---',
            '```js',
            'const x = 1;',
            '```',
        ].join('\n');
        expect(toPlainText(input)).toBe([
            'Heading',
            'Bold and also bold, italic and italic, code.',
            'See the readout and chart.',
            'quoted line',
            '',
            'const x = 1;',
        ].join('\n'));
    });

    it('removes HTML, including script/style contents and comments', () => {
        const input = 'Safe<script>alert(1)</script> <b>text</b><style>p{}</style><!-- hidden --><img src=x onerror=alert(1)><br>next';
        expect(toPlainText(input)).toBe('Safe text\nnext');
    });

    it('keeps citations, list markers, snake_case and arithmetic intact', () => {
        const input = '* item one [1]\n+ item two [2][3]\n1. numbered\nuse my_var_name, 2 * 3 * 4';
        expect(toPlainText(input)).toBe('- item one [1]\n- item two [2][3]\n1. numbered\nuse my_var_name, 2 * 3 * 4');
    });

    it('strips control characters and collapses blank-line runs', () => {
        expect(toPlainText('a\u0000b\r\n\r\n\r\n\r\nc\u0007  ')).toBe('ab\n\nc');
    });

    it('tolerates non-string input', () => {
        expect(toPlainText(undefined)).toBe('');
    });
});

describe('renumberCitations', () => {
    it('renumbers by first appearance and reports which sources were cited', () => {
        const { text, cited } = renumberCitations('Alpha [3]. Beta [1][3]. Gamma [3].', 5);
        expect(text).toBe('Alpha [1]. Beta [2][1]. Gamma [1].');
        expect(cited).toEqual([2, 0]);
    });

    it('drops out-of-range markers and tidies the space they leave', () => {
        const { text, cited } = renumberCitations('Claim [9]. Other [0] claim [2].', 3);
        expect(text).toBe('Claim. Other claim [1].');
        expect(cited).toEqual([1]);
    });

    it('expands comma lists and ranges, de-duplicating within a marker', () => {
        const { text, cited } = renumberCitations('A [2, 4]. B [1-3]. C [2,2].', 4);
        expect(text).toBe('A [1][2]. B [3][1][4]. C [1].');
        expect(cited).toEqual([1, 3, 0, 2]);
    });

    it('returns no sources when nothing is cited', () => {
        expect(renumberCitations('The sources do not cover this.', 6)).toEqual({
            text: 'The sources do not cover this.',
            cited: [],
        });
    });
});

describe('resolveProvider', () => {
    it('is off when LLM_PROVIDER is unset or blank', () => {
        expect(resolveProvider({})).toBeNull();
        expect(resolveProvider({ LLM_PROVIDER: '  ' })).toBeNull();
    });

    it('accepts ollama case-insensitively', () => {
        expect(resolveProvider({ LLM_PROVIDER: 'Ollama' })).toBe('ollama');
    });

    it('refuses an unsupported provider', () => {
        expect(() => resolveProvider({ LLM_PROVIDER: 'bedrock' })).toThrow(/not supported/);
    });
});
