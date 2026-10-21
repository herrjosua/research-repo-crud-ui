const { CAPTURE_SCRIPT_VERSION, validateStaticAnswers } = require('../ask/staticAnswers');
const { reviewRun, defaultRun } = require('../scripts/capture-static-answers');

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
            .toEqual(['no citations', 'uncited sentence: "Nothing covers this."']);

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

// The review reads sentences and figures by ask/checks.js's analyseAnswer,
// as the live route and the harness do (askChecks.test.js covers the rules
// themselves); these pin what the review reports and what the gate blocks.
describe('capture review: sentences', () => {
    const cite = (...excerpts) => excerpts.map((excerpt) => ({ recordId: 'raw:a', recordKind: 'raw', title: 'Title', section: null, excerpt }));
    const flags = (answer, sources) => reviewRun({ answer, sources, raw: '' }, 6).flags;

    it('attaches markers to the sentence they follow, before or after the full stop', () => {
        expect(flags(
            'Errors in 3 of 5 sessions. [1] Physicians read every line [2].\n\nBoth [1][3].',
            cite('Errors in 3 of 5 sessions', 'Physicians read every line', 'Both'),
        )).toEqual([]);
    });

    it('flags a sentence whose citation comes after the next sentence as uncited', () => {
        expect(flags(
            'Senior coders worried about upcoding. They wanted the coder to make the final call. [1]',
            cite('Senior coders worried about upcoding; they wanted the coder to make the final call.'),
        )).toEqual(['uncited sentence: "Senior coders worried about upcoding."']);
    });

    it('starts a new sentence at markers followed by a lowercase word, not a capital', () => {
        const source = cite('Admins hesitated at the calendar step and skipped it.');
        expect(flags('Admins hesitated at the calendar step. [1] mentions that admins skipped it.', source))
            .toEqual(['uncited sentence: "Admins hesitated at the calendar step."']);
        expect(flags('Admins hesitated at the calendar step. [1] Admins skipped it [1].', source)).toEqual([]);
    });

    it('never splits a quotation at its own full stops, but can end a sentence at its closing mark', () => {
        expect(flags('A physician said "I love this job. I do not love the notes." [1]', cite('I love this job. I do not love the notes.')))
            .toEqual([]);
        expect(flags('She said "I chart in bed." Physicians read every line [1].', cite('Physicians read every line; she charts in bed.')))
            .toEqual(['uncited sentence: "She said "I chart in bed.""']);
    });

    it('reads "(6.5 min vs. 9 min…)" as one sentence', () => {
        expect(flags('Drafting took less time with the AI (6.5 min vs. 9 min per case) [1].', cite('Drafting took 6.5 min vs. 9 min per case with the AI.')))
            .toEqual([]);
    });
});

describe('capture review: figures', () => {
    const cite = (...excerpts) => excerpts.map((excerpt) => ({ excerpt }));
    const figureFlags = (answer, sources) => reviewRun({ answer, sources, raw: '' }, 6).flags.filter((f) => /^(number|count)\(s\)/.test(f));

    it('catches the right number in the wrong count (the dropped session-lock answer)', () => {
        expect(figureFlags(
            'Four out of four clinicians who were shadowed assumed that their draft was lost [1].',
            cite('In the current build, a session lock mid-recording simply freezes the widget; 4 of 5 clinicians assumed the draft was lost.'),
        )).toEqual(['count(s) no cited excerpt states: "4 of 4" in "Four out of four clinicians who were shadowed assumed that their draft was lost."']);
    });

    it('treats spelled-out numbers and digits alike, and reads percentages as numbers', () => {
        expect(figureFlags('Two of three tried to skip it [1]; 52% chose it [2].', cite('2 of 3 tried', '52% selected it'))).toEqual([]);
        expect(figureFlags('Twelve physicians, 64% of them [1].', cite('64% of physician respondents')))
            .toEqual(['number(s) in no cited excerpt: 12 in "Twelve physicians, 64% of them."']);
    });

    it('flags a number derived rather than stated', () => {
        expect(figureFlags('The AI saved an estimated 10 minutes per case [1].', cite('from ~15 minutes to ~5 minutes')))
            .toEqual(['number(s) in no cited excerpt: 10 in "The AI saved an estimated 10 minutes per case."']);
    });

    it('holds a figure to its own sentence\'s citations, not every cited source', () => {
        expect(figureFlags('Physicians read every line [1]. Twelve doctors distrusted the garbled dosages [2].', cite('12 physicians read every line', 'Doctors distrusted the garbled dosages.')))
            .toEqual(['number(s) in no cited excerpt: 12 in "Twelve doctors distrusted the garbled dosages."']);
    });

    it('lets a sentence repeat its cited source\'s label date', () => {
        const dated = (date) => [{ excerpt: 'Physicians read every line of the draft.', date }];
        expect(figureFlags('In the April 8, 2025 test, physicians read every line [1].', dated('Apr 8, 2025'))).toEqual([]);
        expect(figureFlags('In the April 8, 2025 test, physicians read every line [1].', dated('Apr 9, 2025')))
            .toEqual(['number(s) in no cited excerpt: 8, 2025 in "In the April 8, 2025 test, physicians read every line."']);
    });

    it('lets an uncited decline repeat a figure from the question or a shown source', () => {
        const answer = 'The sources do not say whether step 4 was tested.';
        const review = (shownSources, question) => reviewRun({ answer, sources: [], raw: '', shownSources }, 6, question).flags;
        expect(review([], '')).toEqual(['no citations', `number(s) in no cited excerpt: 4 in "${answer}"`]);
        expect(review([{ title: 'Onboarding flow', excerpt: 'Step 4: connect your calendar.' }], '')).toEqual(['no citations']);
        expect(review([], 'Was step 4 tested?')).toEqual(['no citations']);
    });
});

describe('defaultRun (the publish gate)', () => {
    const sources = [
        { recordId: 'raw:a', recordKind: 'raw', title: 'Session', section: null, excerpt: '12 physicians read every line of the draft.' },
        { recordId: 'finding:b', recordKind: 'finding', title: 'Finding', section: null, excerpt: 'Physicians distrusted the garbled dosages.' },
    ];
    const run = (n, answer) => ({ run: n, review: reviewRun({ answer, sources, raw: '' }, 6) });
    const uncited = run(1, 'Physicians read every line of the draft [1]. Afterwards they went home. Physicians distrusted the garbled dosages [2].');
    const figure = run(2, 'Physicians read every line of the draft [1]. Twelve physicians distrusted the garbled dosages [2].');
    const clean = run(3, 'Twelve physicians read every line of the draft [1]. Physicians distrusted the garbled dosages [2].');

    it('skips a run with an uncited sentence or a figure its own sentence doesn\'t cite', () => {
        expect(uncited.review.meetsBar && figure.review.meetsBar && clean.review.meetsBar).toBe(true);
        expect(uncited.review.flags).toEqual(['uncited sentence: "Afterwards they went home."']);
        expect(figure.review.flags).toEqual(['number(s) in no cited excerpt: 12 in "Twelve physicians distrusted the garbled dosages."']);
        expect(defaultRun([uncited, figure, clean])).toBe(clean);
        expect(defaultRun([uncited, figure])).toBeUndefined();
    });
});

// RR-207: an opening decline followed by cited claims gets a flag, so the
// publish gate skips the run and choosing it takes --pick.
describe('capture review: an opening decline followed by cited claims', () => {
    const sources = [
        { recordId: 'raw:medflag', recordKind: 'raw', title: 'Concept test — medication change flag', section: 'Session 1', excerpt: 'The physician read the flagged medication line first and checked it against the order.' },
        { recordId: 'finding:medflag', recordKind: 'finding', title: 'Medication flag finding', section: null, excerpt: 'Physicians checked the flagged medication line against the order before accepting.' },
    ];
    const run = (n, answer, runSources = sources) => ({ run: n, review: reviewRun({ answer, sources: runSources, raw: '' }, 6) });
    const DECLINE = 'The sources do not contain information about how physicians reacted to the medication flag concept.';
    const claims = 'The physician read the flagged medication line first [1]. Physicians checked it against the order before accepting [2].';
    const declined = run(3, `${DECLINE} ${claims}`);
    const clean = run(1, claims);

    it('flags the decline, though the run meets the bar', () => {
        expect(declined.review.meetsBar).toBe(true);
        expect(declined.review.flags).toEqual([
            `opens with a decline but cites claims; check the decline against the shown passages: "${DECLINE.slice(0, 90)}…"`,
        ]);
    });

    it('leaves defaultRun to a clean run, and to none when there is none', () => {
        expect(clean.review.flags).toEqual([]);
        expect(defaultRun([declined, clean])).toBe(clean);
        expect(defaultRun([declined])).toBeUndefined();
    });

    it('flags the correct burnout decline too, so publishing it needs --pick', () => {
        const burnout = run(1, 'The sources do not contain what percentage of clinicians report burnout. 52% of physicians ranked documentation burden as the top contributor to burnout [1][2].', [
            { recordId: 'raw:survey', recordKind: 'raw', title: 'Survey — Clinician Burnout', section: 'Key Findings', excerpt: 'Documentation burden ranked as the #1 contributor to burnout among physicians (52%).' },
            { recordId: 'finding:burden', recordKind: 'finding', title: 'Documentation burden', section: null, excerpt: '52% of physicians ranked documentation burden as the top contributor to burnout.' },
        ]);
        expect(burnout.review.meetsBar).toBe(true);
        expect(burnout.review.flags).toEqual([expect.stringMatching(/^opens with a decline but cites claims/)]);
        expect(defaultRun([burnout])).toBeUndefined();
    });
});
