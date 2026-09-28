const { CAPTURE_SCRIPT_VERSION, validateStaticAnswers } = require('../ask/staticAnswers');
const { reviewRun, citedSentences, unsupportedNumbers } = require('../scripts/capture-static-answers');

// The static answers file's validator (ask/staticAnswers.js) and the capture
// script's review checks. staticAnswers.data.test.js checks the real file.

describe('validateStaticAnswers', () => {
    const source = (n) => ({
        id: `raw:x#${n}`, kind: 'transcript', title: 'T', excerpt: 'E', project: null, recordProject: null,
        date: null, contextBefore: null, contextAfter: null, section: null, recordId: 'raw:x',
        recordKind: 'raw', recordType: null, score: 0.5,
    });
    const valid = () => ({
        metadata: {
            model: 'gemma2:9b', embedModel: 'nomic-embed-text', capturedAt: '2026-09-28T12:00:00.000Z',
            corpusCommit: 'a'.repeat(40), scriptVersion: 1,
        },
        questions: [{ id: 'q', question: 'Q?', project: null, answer: 'A [1] and [2].', sources: [source(1), source(2)], run: 1 }],
    });

    it('accepts a well-formed file', () => {
        expect(validateStaticAnswers(valid())).toEqual([]);
    });

    it.each([
        ['a marker beyond the sources', (d) => { d.questions[0].answer = 'A [1] [2] [3].'; }, /\[3\] beyond its 2 source/],
        ['citations with no sources', (d) => { d.questions[0].sources = []; }, /cites sources but sources is empty/],
        ['an uncited source', (d) => { d.questions[0].answer = 'A [1].'; }, /sources\[1\] is never cited/],
        ['an empty answer', (d) => { d.questions[0].answer = ' '; }, /answer must be a non-empty string/],
        ['an empty question', (d) => { d.questions[0].question = ''; }, /question must be a non-empty string/],
        ['a bad project', (d) => { d.questions[0].project = 'onboarding'; }, /project must be a project-\* tag or null/],
        ['a source from another project filter', (d) => { d.questions[0].sources[0].project = 'project-x'; }, /project doesn't match/],
        ['a source missing fields', (d) => { delete d.questions[0].sources[1].excerpt; }, /sources\[1\] is missing excerpt/],
        ['a duplicate id', (d) => { d.questions.push({ ...d.questions[0] }); }, /duplicate id/],
        ['a short commit', (d) => { d.metadata.corpusCommit = 'abc1234'; }, /corpusCommit/],
        ['a future script version', (d) => { d.metadata.scriptVersion = CAPTURE_SCRIPT_VERSION + 1; }, /scriptVersion/],
        ['no model', (d) => { delete d.metadata.model; }, /metadata\.model/],
        ['a bad date', (d) => { d.metadata.capturedAt = 'yesterday'; }, /capturedAt/],
    ])('reports %s', (label, mutate, problem) => {
        const data = valid();
        mutate(data);
        expect(validateStaticAnswers(data).join('\n')).toMatch(problem);
    });
});

describe('capture review checks', () => {
    const src = (recordId, recordKind, excerpt) => ({ recordId, recordKind, title: 'Title', section: null, excerpt });

    it('flags no citations, dangling model markers, and unrelated excerpts', () => {
        expect(reviewRun({ answer: 'Nothing covers this.', sources: [], raw: 'Nothing covers this.' }, 6).flags)
            .toEqual(['no citations']);

        const dangling = reviewRun({
            answer: 'Physicians distrusted garbled medication dosages [1].',
            sources: [src('raw:a', 'raw', 'The scribe garbled medication dosages; physicians distrusted it.')],
            raw: 'Physicians distrusted garbled medication dosages [2][9].',
        }, 6);
        expect(dangling.flags).toEqual([expect.stringMatching(/model cited \[9\], which point at nothing/)]);

        const unrelated = reviewRun({
            answer: 'Coders rejected billing suggestions for denied claims [1].',
            sources: [src('raw:a', 'raw', 'Admins hesitated at the calendar step during onboarding.')],
            raw: '',
        }, 6);
        expect(unrelated.flags).toEqual([expect.stringMatching(/^\[1\] may be unrelated/)]);
    });

    it('checks the citation-count bar: two records including a raw session', () => {
        const run = (sources) => reviewRun({ answer: sources.map((_, i) => `x [${i + 1}]`).join(' '), sources, raw: '' }, 6);
        expect(run([src('raw:a', 'raw', 'x'), src('finding:b', 'finding', 'x')]).meetsBar).toBe(true);
        expect(run([src('finding:a', 'finding', 'x'), src('finding:b', 'finding', 'x')]).meetsBar).toBe(false);
        expect(run([src('raw:a', 'raw', 'x'), { ...src('raw:a', 'raw', 'x') }]).meetsBar).toBe(false);
    });
});

describe('citedSentences', () => {
    it('attaches markers to the sentence they follow, before or after the full stop', () => {
        expect(citedSentences('Errors in 3 of 5 sessions. [1] Physicians read every line [2].\n\nBoth [1][3].')).toEqual([
            { n: 1, sentence: 'Errors in 3 of 5 sessions.' },
            { n: 2, sentence: 'Physicians read every line .' },
            { n: 1, sentence: 'Both .' },
            { n: 3, sentence: 'Both .' },
        ]);
    });
});

describe('unsupportedNumbers', () => {
    const cite = (...excerpts) => excerpts.map((excerpt) => ({ excerpt }));

    it('catches the right number in the wrong count (the dropped session-lock answer)', () => {
        expect(unsupportedNumbers(
            'Four out of four clinicians who were shadowed assumed that their draft was lost [1].',
            cite('In the current build, a session lock mid-recording simply freezes the widget; 4 of 5 clinicians assumed the draft was lost.'),
        )).toEqual({ numbers: [], pairs: ['4 of 4'] });
    });

    it('treats spelled-out numbers and digits alike, and reads percentages as numbers', () => {
        expect(unsupportedNumbers('Two of three tried to skip it [1]; 52% chose it [2].', cite('2 of 3 tried', '52% selected it')))
            .toEqual({ numbers: [], pairs: [] });
        expect(unsupportedNumbers('Twelve physicians, 64% of them [1].', cite('64% of physician respondents')))
            .toEqual({ numbers: ['12'], pairs: [] });
    });

    it('flags a number derived rather than stated', () => {
        expect(unsupportedNumbers('The AI saved an estimated 10 minutes per case [1].', cite('from ~15 minutes to ~5 minutes')))
            .toEqual({ numbers: ['10'], pairs: [] });
    });
});
