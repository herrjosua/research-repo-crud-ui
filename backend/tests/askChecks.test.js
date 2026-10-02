const {
    checkAnswer, analyseAnswer, negationSourcesGap, normalizeText, DECLINE_WINDOW,
} = require('../ask/checks');

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

    // RR checks changes (docs/decisions.md, 20). Fixtures are verbatim from
    // the stored runs in ask/eval/results/ unless they say otherwise.
    describe('a source’s label date counts as evidence (change 1)', () => {
        const NURSES_V1 = {
            ...source('raw:2025-04-08-usability-test-prior-auth-ai-v1', 'Usability Test — Prior Auth AI v1', 'Key Findings', '4 utilization review nurses and 1 supervisor took part.'),
            date: 'Apr 8, 2025',
        };
        const PULSE = { ...AI_READINESS, date: 'Dec 2, 2025' };

        it.each([
            'The usability test on 2025-04-08 had 4 utilization review nurses [1].',
            'The usability test on 04/08/2025 had 4 utilization review nurses [1].',
            'The usability test on 4/8/2025 had 4 utilization review nurses [1].',
            'The usability test on April 8, 2025 had 4 utilization review nurses [1].',
            'The usability test on Apr 8, 2025 had 4 utilization review nurses [1].',
            'The April 8th usability test had 4 utilization review nurses [1].',
            'The usability test in April 2025 had 4 utilization review nurses [1].',
        ])('accepts the label date written as in: %s', (answer) => {
            expect(checkAnswer(answer, [NURSES_V1])).toEqual(CLEAN);
        });

        it('accepts the real gemma3:27b sentences', () => {
            expect(checkAnswer('This feature was directly added in response to a finding from the April 8th usability test with 4 utilization review nurses [1].', [NURSES_V1])).toEqual(CLEAN);
            expect(checkAnswer('According to a December 2025 survey, 71% of clinical staff reported awareness of Compass AI initiatives [1].', [PULSE])).toEqual(CLEAN);
        });

        it('matches the parsed date, not its digits', () => {
            expect(checkAnswer('The usability test on April 9, 2025 had 4 nurses [1].', [NURSES_V1]).unsupportedFigures).toEqual(['9', '2025']);
            expect(checkAnswer('The usability test in March 2025 had 4 nurses [1].', [NURSES_V1]).unsupportedFigures).toEqual(['2025']);
            // Day and month swapped: not the label date, so judged as before
            // (the "N/M" count rule reads "08/04" as a count, too).
            expect(checkAnswer('The usability test on 08/04/2025 had 4 nurses [1].', [NURSES_V1]).unsupportedFigures).toEqual(['08', '04', '2025', '08 of 04']);
            // A stray "04" or "08" is a figure, never evidence from the date.
            expect(checkAnswer('Sessions 04 and 08 ran long [1].', [NURSES_V1]).unsupportedFigures).toEqual(['04', '08']);
        });

        it('only counts the dates of the sources the sentence cites', () => {
            expect(checkAnswer('The test on April 8, 2025 found the awareness gap [1].', [PULSE, NURSES_V1]).unsupportedFigures).toEqual(['8', '2025']);
            expect(checkAnswer('The test on April 8, 2025 found the awareness gap [1].', [{ ...NURSES_V1, date: null }]).unsupportedFigures).toEqual(['8', '2025']);
        });

        it('never counts a time, since labels carry none', () => {
            expect(checkAnswer('The test on April 8, 2025 at 9:30 had 4 nurses [1].', [NURSES_V1]).unsupportedFigures).toEqual(['9', '30']);
        });
    });

    describe('a decline needs its negation within 80 characters of "sources" (change 2)', () => {
        // The stored onboarding-required-steps sentences: the "labeled" one
        // (behavior-combined and behavior-decline-list unseeded runs) and
        // the "stated" one (behavior-decline-list seeded).
        it.each([
            ['Steps 1, 2, 4, 5, and 6 are not explicitly labeled as required or optional in the provided sources.', 60],
            ['Steps 1, 2, 4, 5, and 6 are not explicitly stated as required or optional in the provided sources.', 59],
            ['The question cannot be answered from the provided sources.', 31],
        ])('still counts %s (gap %i)', (sentence, gap) => {
            expect(negationSourcesGap(sentence)).toBe(gap);
            expect(gap).toBeLessThanOrEqual(DECLINE_WINDOW);
            expect(analyseAnswer(sentence, [])[0].exempt).toBe('decline');
        });

        it('no longer excuses a claim that mentions "sources" far from its negation', () => {
            const sentence = 'Participants did not finish the calendar step, and the readout, which pulls together all six onboarding sessions, the funnel export and both survey sources, recommends a clearer label.';
            expect(negationSourcesGap(sentence)).toBeGreaterThan(DECLINE_WINDOW);
            expect(analyseAnswer(sentence, [])[0].exempt).toBeNull();
            expect(checkAnswer(sentence, []).uncited).toEqual([sentence]);
        });
    });

    describe('a quotation stays in its sentence (change 3)', () => {
        const SURVEY_QUOTES = source(
            'raw:2025-09-09-survey-clinician-burnout-documentation-burden-baseline',
            'Survey — Clinician Burnout & Documentation Burden Baseline',
            'Representative Quotes',
            '"I love this job. I do not love finishing my notes at 9pm after my kids are in bed. If AI fixes that, I\'m in." — Physician, P84',
        );

        it('keeps a straight-quoted span with its citation (scenario-documentation-pain-points, behavior-decline-list)', () => {
            const answer = '64% of physician respondents report regularly completing documentation after clinic hours [1]. "I love this job. I do not love finishing my notes at 9pm after my kids are in bed. If AI fixes that, I\'m in." — Physician, P84 [2].';
            const sentences = analyseAnswer(answer, [{ ...BURNOUT_SURVEY, excerpt: '64% of physician respondents report regularly completing documentation after clinic hours.' }, SURVEY_QUOTES]);
            expect(sentences.map((x) => x.cites)).toEqual([[1], [2]]);
            expect(sentences[1].text).toBe('"I love this job. I do not love finishing my notes at 9pm after my kids are in bed. If AI fixes that, I\'m in." — Physician, P84.');
            expect(sentences.flatMap((x) => x.unsupported)).toEqual([]);
        });

        it('keeps a quote introduced mid-sentence (behavior-combined)', () => {
            const answer = 'A physician participant stated, "I love this job. I do not love finishing my notes at 9pm after my kids are in bed. If AI fixes that, I\'m in." [1].';
            expect(checkAnswer(answer, [SURVEY_QUOTES])).toEqual(CLEAN);
        });

        it('keeps curly quotes together too', () => {
            const answer = 'One supervisor said, “This is what I wanted in April. It shows its work.” [1]';
            expect(analyseAnswer(answer, [SURVEY_QUOTES]).map((x) => x.text)).toEqual(['One supervisor said, “This is what I wanted in April. It shows its work.”']);
        });

        it('ends a sentence at a closing quote only before a capital or another quote', () => {
            const ended = analyseAnswer('He said "it was slow." The readout agreed [1].', [READOUT]);
            expect(ended.map((x) => x.text)).toEqual(['He said "it was slow."', 'The readout agreed.']);
            const continued = analyseAnswer('Participant in session 1 paused at step 3 and said "wait, do I have to do this?" before proceeding [1].', [SESSION_2]);
            expect(continued).toHaveLength(1);
        });

        // scenario-care-coordinator-gaps, behavior-decline-list seeded: the
        // quotes no longer split, which clears two uncited fragments and the
        // P03 quote; "6.5 min vs." no longer splits either (docs/decisions.md,
        // 21; decision 20 left it).
        it('fixes the care-coordinator quotes and the "vs." split', () => {
            const answer = '[1] Coordinators distrust the AVS tool. [2] "I don\'t trust the summary the system spits out. I\'ve been burned by it missing a med change, so now I just re-check everything myself, which kind of defeats the point." — Care Coordinator, P03 [3] The triage ranking works, but not for the reason initially expected. It was faster (6.5 min vs. 9 min to clear a 20-item queue), but 4 of 5 participants disagreed with at least one ranking decision. [4] "It\'s fast, I\'ll give it that. But fast and wrong is worse than slow and right in this job." — Care Coordinator Supervisor, P79';
            const texts = analyseAnswer(answer, [READOUT, READOUT, READOUT, READOUT]).map((x) => x.text);
            expect(texts.some((t) => t.startsWith('"I don\'t trust the summary the system spits out. I\'ve been burned'))).toBe(true);
            expect(texts.some((t) => t.startsWith('"It\'s fast, I\'ll give it that. But fast and wrong'))).toBe(true);
            expect(texts.some((t) => t.startsWith('It was faster (6.5 min vs. 9 min to clear a 20-item queue), but 4 of 5 participants disagreed'))).toBe(true);
            expect(texts).not.toContain('It was faster (6.5 min vs.');
        });
    });

    describe('"vs." and "avg." don’t end a sentence (decision 21)', () => {
        // scenario-documentation-pain-points, behavior-decline-list unseeded,
        // with the two sources it cites. The split left "…charting (avg."
        // uncited, with the 1 of "#1", 52, 31 and 64 unsupported.
        const DOC_SURVEY = source(
            'raw:2025-09-09-survey-clinician-burnout-documentation-burden-baseline',
            'Survey — Clinician Burnout & Documentation Burden Baseline',
            'Key Findings',
            '[HIGH] (documentation as burnout driver) Documentation burden ranked as the #1 self-selected contributor to burnout among physicians specifically (52%), ahead of patient volume (31%) and administrative meetings (12%).\n[MEDIUM] (after-hours charting) 64% of physician respondents report regularly completing documentation after clinic hours (\'pajama time\'), averaging a self-reported 1.2 hours/day.',
        );
        const DOC_FINDING = source(
            'finding:clinician-experience-documentation-burden',
            'Clinician Experience & Documentation Burden',
            'Overview',
            'Documentation burden is real and quantifiable, not just anecdotal. The September baseline found documentation burden is physicians\' #1 self-selected burnout driver (52%, ahead of patient volume at 31%), with 64% doing regular after-hours "pajama time" charting (avg. 1.2 hrs/day).',
        );

        it('keeps "(avg. 1.2 hrs/day)" in its sentence and its citation', () => {
            const answer = 'Documentation burden is clinicians\' #1 self-selected burnout driver (52%, ahead of patient volume at 31%), with 64% doing regular after-hours "pajama time" charting (avg. 1.2 hrs/day) [1][2].';
            const sentences = analyseAnswer(answer, [DOC_SURVEY, DOC_FINDING]);
            expect(sentences).toHaveLength(1);
            expect(sentences[0].cites).toEqual([1, 2]);
            expect(checkAnswer(answer, [DOC_SURVEY, DOC_FINDING])).toEqual(CLEAN);
        });

        // scenario-care-coordinator-gaps, model-gpt-oss-20b-low unseeded.
        it('keeps gpt-oss\'s "6.5\u2011minute vs. 9\u2011minute" in its sentence', () => {
            const answer = '- The impact of the current ranking model on overall workflow efficiency beyond the 20\u2011item queue test. We only have a single 6.5\u2011minute vs. 9\u2011minute comparison; we do not know how this translates to real\u2011world call volumes, patient outcomes, or supervisor oversight [4].';
            expect(analyseAnswer(answer, [READOUT, READOUT, READOUT, READOUT]).map((x) => x.text)).toEqual([
                'The impact of the current ranking model on overall workflow efficiency beyond the 20-item queue test.',
                'We only have a single 6.5-minute vs. 9-minute comparison; we do not know how this translates to real-world call volumes, patient outcomes, or supervisor oversight.',
            ]);
        });

        it('matches "VS." and "Avg." in any case', () => {
            expect(analyseAnswer('Faster (6.5 min VS. 9 min) [1].', [READOUT])).toHaveLength(1);
            expect(analyseAnswer('Charting (Avg. 1.2 hrs/day) [1].', [READOUT])).toHaveLength(1);
        });

        it('leaves "vs" without a period and "avg" inside a word alone', () => {
            expect(analyseAnswer('Fast vs slow. The readout agreed [1].', [READOUT]).map((x) => x.text)).toEqual(['Fast vs slow.', 'The readout agreed.']);
            expect(analyseAnswer('It was a navg. The readout agreed [1].', [READOUT]).map((x) => x.text)).toEqual(['It was a navg.', 'The readout agreed.']);
        });

        it('still splits an ordinary sentence end before a capital', () => {
            expect(analyseAnswer('The step was slow. The readout agreed [1].', [READOUT]).map((x) => x.text)).toEqual(['The step was slow.', 'The readout agreed.']);
        });

        it('leaves "e.g." as it was: it still splits', () => {
            expect(analyseAnswer('Some steps, e.g. step 3, read as optional [1].', [READOUT]).map((x) => x.text)).toEqual(['Some steps, e.g.', 'step 3, read as optional.']);
        });
    });

    describe('"surveys" is a decline noun (decision 21)', () => {
        // audit-burnout-share, checks-gpt-oss-20b-low seeded.
        const SENTENCE = 'The surveys do not report an overall burnout rate for clinicians.';

        it('counts the stored gpt-oss sentence as a decline', () => {
            expect(analyseAnswer(SENTENCE, [])[0].exempt).toBe('decline');
            expect(checkAnswer(SENTENCE, [], 'What percentage of clinicians report burnout?')).toEqual(CLEAN);
        });

        it('still flags a claim that mentions "surveys" without a negation', () => {
            const claim = 'The surveys show 52% of physicians ranked documentation first.';
            expect(analyseAnswer(claim, [])[0].exempt).toBeNull();
            expect(checkAnswer(claim, []).uncited).toEqual([claim]);
        });

        it('doesn\'t excuse a negated claim with "surveys" after the negation', () => {
            const claim = 'Physicians did not complete the surveys on time.';
            expect(analyseAnswer(claim, [])[0].exempt).toBeNull();
            expect(checkAnswer(claim, []).uncited).toEqual([claim]);
        });
    });

    describe('an uncited decline’s figures may come from the shown sources (change 4)', () => {
        const FLOW = {
            ...source('deliverable:user-flows/onboarding-flow', 'Onboarding Flow — v2', 'Steps', 'Step 1 — Signup\nStep 2 — Basics (workspace name, team size)\nStep 3 — Connect calendar (now clearly marked required)\nStep 4 — Invite your team (now shows draft/not-sent state)\nStep 5 — Preferences\nStep 6 — Review & finish'),
            date: 'Feb 20, 2026',
        };
        const question = 'Which onboarding steps are required, and which can be skipped?';
        // onboarding-required-steps, behavior-decline-list seeded.
        const answer = 'Step 3 ("Connect calendar") is required [1][2][3].\n\nSteps 1, 2, 4, 5, and 6 are not explicitly stated as required or optional in the provided sources.';

        it('clears "Steps 1, 2, 4, 5, and 6" when the shown flow lists them', () => {
            const cited = [ONBOARDING_FINDING, TOPLINE, READOUT];
            expect(checkAnswer(answer, cited, question).unsupportedFigures).toEqual(['1', '2', '4', '5', '6']);
            expect(checkAnswer(answer, cited, question, [...cited, FLOW, SESSION_2]).unsupportedFigures).toEqual([]);
        });

        it('still flags a figure no shown source or the question has', () => {
            expect(checkAnswer('Step 7 is not described in the provided sources.', [], question, [FLOW]).unsupportedFigures).toEqual(['7']);
        });

        it('holds a cited sentence to its own sources, not the shown ones', () => {
            expect(checkAnswer('Step 5 is optional [1].', [READOUT], question, [READOUT, FLOW]).unsupportedFigures).toEqual(['5']);
        });

        it('counts a shown source’s label date for an uncited decline', () => {
            expect(checkAnswer('The sources do not say whether the February 20, 2026 flow was tested.', [], question, [FLOW])).toEqual(CLEAN);
        });
    });

    describe('gpt-oss’s narrow no-break space and non-breaking hyphen (change 5)', () => {
        it('reads U+202F as a space and U+2011 as a hyphen', () => {
            expect(normalizeText('Only 34\u202F% of non\u2011clinical staff')).toBe('Only 34 % of non-clinical staff');
        });

        it('judges a gpt-oss sentence as its plain form', () => {
            const answer = 'Only 34\u202F% of non\u2011clinical staff were aware, versus 71\u202F% of clinical staff [1].';
            expect(checkAnswer(answer, [AI_READINESS])).toEqual(CLEAN);
            expect(analyseAnswer(answer, [AI_READINESS])[0].text).toBe('Only 34 % of non-clinical staff were aware, versus 71 % of clinical staff.');
        });
    });
});
