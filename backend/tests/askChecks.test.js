const { checkAnswer, analyseAnswer } = require('../ask/checks');

// ask/checks.js, on answers the corpus audit logged as wrong (and the
// harness baselines), with the sources as the pipeline cites them. The
// excerpts are verbatim from the agentic-repo corpus.

const source = (recordId, title, section, excerpt) => ({
    recordId, recordKind: recordId.split(':')[0], title, section, excerpt,
});

const BURNOUT_SURVEY = source(
    'raw:2025-09-09-survey-clinician-burnout-documentation-burden-baseline',
    'Survey — Clinician Burnout & Documentation Burden Baseline',
    'Key Findings',
    '[HIGH] (documentation as burnout driver) Documentation burden ranked as the #1 self-selected contributor to burnout among physicians specifically (52%), ahead of patient volume (31%) and administrative meetings (12%).',
);
const AI_READINESS = source(
    'raw:2025-12-02-survey-allstaff-ai-readiness-pulse',
    'Survey — All-Staff AI Readiness Pulse Survey',
    'Key Findings',
    '[MEDIUM] (awareness gap) Only 34% of non-clinical staff reported being aware Compass AI initiatives were underway at all, versus 71% of clinical staff.',
);
const ONBOARDING_FINDING = source(
    'finding:onboarding',
    'Onboarding flow — setup step confusion',
    'Evidence',
    'In sessions 1–3, 2 of 3 participants tried to skip step 3 ("Connect calendar"): session 1 tried to exit via the step label, and session 2 tried to skip it before hitting the "required" indicator.',
);
const TOPLINE = source(
    'deliverable:topline-summaries/example-topline-summary',
    'Onboarding Study — Session 1–3 Topline',
    'Quick takeaways',
    '2 of 3 tried to skip step 3 ("Connect calendar") entirely, assuming it was optional even though it\'s required.',
);
const READOUT = source(
    'deliverable:research-readouts/onboarding-flow-q1-readout',
    'Onboarding Flow — Q1 Readout',
    'Summary',
    'The single largest source of first-time-setup friction is step 3 ("Connect calendar") reading as optional when it\'s actually required.',
);
const SESSION_2 = source(
    'raw:2026-01-19-onboarding-usability-test',
    'Onboarding usability test — session notes',
    'Session 2 — Jan 20',
    'Attempted to skip step 2 directly, assuming it was optional. Backed out when the "required" indicator appeared.',
);

const CLEAN = { uncited: [], unsupportedFigures: [], stacked: [] };

describe('checkAnswer', () => {
    it('returns nothing to flag for a clean, cited answer', () => {
        const answer = 'Only 34% of non-clinical staff reported being aware Compass AI initiatives were underway at all, versus 71% of clinical staff. [1]';
        expect(checkAnswer(answer, [AI_READINESS], 'How aware were staff of the Compass AI initiatives?')).toEqual(CLEAN);
    });

    it("counts a raw session's roster line as evidence, since the model is shown it", () => {
        const answer = 'The dosage errors came up across the 287 respondents [1].';
        const withRoster = { ...BURNOUT_SURVEY, participants: 'Participants: 287 — Physician, Nurse Practitioner' };
        expect(checkAnswer(answer, [withRoster]).unsupportedFigures).toEqual([]);
        expect(checkAnswer(answer, [BURNOUT_SURVEY]).unsupportedFigures).toEqual(['287']);
    });

    describe('the invented "52% report burnout"', () => {
        const question = 'What percentage of clinicians report burnout?';

        it('flags it uncited, with an unsupported figure, when it cites nothing', () => {
            expect(checkAnswer('52% of clinicians report burnout.', [], question)).toEqual({
                uncited: ['52% of clinicians report burnout.'],
                unsupportedFigures: ['52'],
                stacked: [],
            });
        });

        // A known limit: 52 is in the excerpt (as documentation's share), so
        // the misreading can't be caught by figures. The gold set's
        // must-not claim catches it instead.
        it('can’t flag the misreading when it cites the survey that holds 52%', () => {
            expect(checkAnswer('52% of clinicians report burnout [1].', [BURNOUT_SURVEY], question)).toEqual(CLEAN);
        });
    });

    it('flags the invented "69%/31%" readiness split cited to the pulse survey', () => {
        const answer = '69% of staff felt ready for Compass AI and 31% did not [1].';
        expect(checkAnswer(answer, [AI_READINESS], 'How aware were staff of the Compass AI initiatives?').unsupportedFigures).toEqual(['69', '31']);
    });

    it('holds a figure to its own sentence’s citations: 31% from the burnout survey doesn’t support the readiness claim', () => {
        const answer = 'Documentation burden came first [2]. 69% of staff felt ready for Compass AI and 31% did not [1].';
        expect(checkAnswer(answer, [AI_READINESS, BURNOUT_SURVEY]).unsupportedFigures).toEqual(['69', '31']);
    });

    it('flags the uncited "Step 2 (Basics) can be skipped" and the stack before it (the regression baseline’s answer)', () => {
        const answer = 'Step 3 ("Connect calendar") is required [1][2][3].\n\nStep 2 ("Basics") can be skipped. A participant in session 2 attempted to skip it directly [4].';
        expect(checkAnswer(answer, [ONBOARDING_FINDING, TOPLINE, READOUT, SESSION_2], 'Which onboarding steps are required, and which can be skipped?')).toEqual({
            uncited: ['Step 2 ("Basics") can be skipped.'],
            unsupportedFigures: ['2'],
            stacked: ['Step 3 ("Connect calendar") is required.'],
        });
    });

    it('counts a stack by distinct sources, not markers', () => {
        const answer = 'Step 3 is required [1][2][1].';
        expect(checkAnswer(answer, [ONBOARDING_FINDING, TOPLINE]).stacked).toEqual([]);
        expect(analyseAnswer(answer, [ONBOARDING_FINDING, TOPLINE])[0].stack).toBe(2);
    });

    it('exempts a list cited as a group, and its items’ figures come from the group’s sources', () => {
        const answer = '1. Signup\n2. Basics\n3. Connect calendar\n[1]';
        const flow = source('deliverable:user-flows/onboarding-flow', 'Onboarding Flow — v2', 'Steps', 'Step 1 — Signup\nStep 2 — Basics\nStep 3 — Connect calendar');
        expect(checkAnswer(answer, [flow])).toEqual(CLEAN);
        expect(analyseAnswer(answer, [flow]).map((s) => s.exempt)).toEqual(Array(3).fill('group-cited list item'));
    });

    it('exempts a cited list intro and the items under it, but not an uncited list', () => {
        expect(checkAnswer('The required step is: [1]\n- Connect calendar', [READOUT])).toEqual(CLEAN);
        expect(checkAnswer('The steps are:\n- Signup\n- Basics', []).uncited).toEqual(['Signup', 'Basics']);
    });

    it('lets a decline repeat a figure from the question, but not invent one', () => {
        const question = 'What does the step 3 wireframe show?';
        expect(checkAnswer('The sources do not describe the step 3 wireframe.', [], question)).toEqual(CLEAN);
        expect(checkAnswer('The sources do not describe the step 5 wireframe.', [], question)).toEqual({
            uncited: [],
            unsupportedFigures: ['5'],
            stacked: [],
        });
    });

    // Declines the stored runs gave that DECLINE_RE's word order missed.
    it.each([
        'The question cannot be answered from the provided sources.',
        'The remaining steps are not explicitly stated as required or optional in the provided sources.',
        'There is no information about this in the sources.',
    ])('counts a negation with "sources" anywhere as a decline: %s', (sentence) => {
        expect(analyseAnswer(sentence, [])[0].exempt).toBe('decline');
        expect(checkAnswer(sentence, [])).toEqual(CLEAN);
    });

    it('still holds a decline’s figures to its sources or the question, and needs the word "sources"', () => {
        const sentence = 'Steps 1, 2, 4, 5, and 6 are not explicitly labeled as required or optional in the provided sources.';
        expect(checkAnswer(sentence, [], 'Which onboarding steps are required?')).toEqual({
            uncited: [], unsupportedFigures: ['1', '2', '4', '5', '6'], stacked: [],
        });
        // No "sources": a negated claim, not a decline.
        expect(checkAnswer('Admins did not know when invites were sent.', []).uncited).toEqual(['Admins did not know when invites were sent.']);
    });

    it('gives a sentence that opens with a marker ("[1] mentions…") its own citation', () => {
        const answer = 'Nothing is listed as unlearned. [1] mentions that three sessions said not to build some features.';
        const sentences = analyseAnswer(answer, [READOUT]);
        expect(sentences.map((x) => [x.text, x.cites])).toEqual([
            ['Nothing is listed as unlearned.', []],
            ['mentions that three sessions said not to build some features.', [1]],
        ]);
        expect(sentences[0].uncited).toBe(true);
        expect(sentences[1].uncited).toBe(false);
    });

    it('keeps a marker after the period with the sentence before when a capital follows', () => {
        const answer = 'Step 3 read as optional. [1] The readout recommends a clearer label [1].';
        expect(analyseAnswer(answer, [READOUT]).map((x) => [x.text, x.cites])).toEqual([
            ['Step 3 read as optional.', [1]],
            ['The readout recommends a clearer label.', [1]],
        ]);
    });

    it('leaves a list cited only on its last item uncited above that item (unchanged)', () => {
        const answer = '- Step 1 — Signup\n- Step 2 — Basics\n- Step 3 — Connect calendar [1]';
        const flow = source('deliverable:user-flows/onboarding-flow', 'Onboarding Flow — v2', 'Steps', 'Step 1 — Signup\nStep 2 — Basics\nStep 3 — Connect calendar');
        expect(checkAnswer(answer, [flow]).uncited).toEqual(['Step 1 — Signup', 'Step 2 — Basics']);
    });

    it('counts a figure found only in a cited source’s title or section as supported', () => {
        const excerpt = 'Backed out when the "required" indicator appeared.';
        const inSection = source('raw:s', 'Onboarding usability test — session notes', 'Session 2 — Jan 20', excerpt);
        const inTitle = source('deliverable:t', 'Onboarding Study — Session 1–3 Topline', 'Quick takeaways', excerpt);
        expect(checkAnswer('The participant in session 2 backed out [1].', [inSection])).toEqual(CLEAN);
        expect(checkAnswer('Participants in sessions 1 and 3 hesitated [1].', [inTitle])).toEqual(CLEAN);
        // Only the cited source's title counts, not another source's.
        expect(checkAnswer('The participant in session 2 backed out [1].', [READOUT, inSection]).unsupportedFigures).toEqual(['2']);
    });

    it('still catches a right number in the wrong count', () => {
        expect(checkAnswer('3 of 3 tried to skip step 3 [1].', [TOPLINE]).unsupportedFigures).toEqual(['3 of 3']);
    });
});
