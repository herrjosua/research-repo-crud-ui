const { GOLD_FILE, loadGold, validateGold } = require('../ask/eval/gold');
const { answerSentences, analyseAnswer, judgeRun, claimText } = require('../scripts/eval-ask');
const { withChatOptions, chatOverrides } = require('../scripts/capture-static-answers');

// The evaluation gold set (ask/eval/gold.json) and the harness's pass/fail
// checks (scripts/eval-ask.js). Running the harness itself needs Ollama; see
// backend/README.md, "Evaluating answers".

describe('gold set', () => {
    it('the checked-in file is valid', () => {
        expect(() => loadGold(GOLD_FILE)).not.toThrow();
    });

    const valid = () => ({
        version: 1,
        entries: [{
            id: 'q',
            status: 'draft',
            question: 'Q?',
            project: null,
            supportingRecords: ['raw:a', 'finding:b'],
            requiredRawRecord: 'raw:a',
            mustClaims: [{ description: 'says ten', pattern: '\\b10\\b' }],
            mustNotClaims: [],
            evidence: 'raw:a says 10.',
        }],
    });

    it('accepts a well-formed file', () => {
        expect(validateGold(valid())).toEqual([]);
    });

    it('accepts acceptDecline as true or false, or left out', () => {
        for (const flag of [true, false]) {
            const data = valid();
            data.entries[0].acceptDecline = flag;
            expect(validateGold(data)).toEqual([]);
        }
    });

    it.each([
        ['a wrong version', (d) => { d.version = 2; }, /version must be 1/],
        ['no entries', (d) => { d.entries = []; }, /entries must be a non-empty array/],
        ['a duplicate id', (d) => { d.entries.push({ ...d.entries[0] }); }, /duplicate id/],
        ['a bad id', (d) => { d.entries[0].id = 'Q 1'; }, /id must match/],
        ['an unknown status', (d) => { d.entries[0].status = 'approved'; }, /status must be one of draft, reviewed/],
        ['an empty question', (d) => { d.entries[0].question = ' '; }, /question must be a non-empty string/],
        ['a bad project', (d) => { d.entries[0].project = 'onboarding'; }, /project must be a project-\* tag or null/],
        ['no supporting records', (d) => { d.entries[0].supportingRecords = []; }, /supportingRecords must be a non-empty array/],
        ['a malformed record id', (d) => { d.entries[0].supportingRecords.push('onboarding.md'); }, /supportingRecords\[2\] is not a record id/],
        ['a duplicate record', (d) => { d.entries[0].supportingRecords.push('raw:a'); }, /supportingRecords has duplicates/],
        ['a non-raw required record', (d) => { d.entries[0].requiredRawRecord = 'finding:b'; }, /requiredRawRecord must be a raw: record id or null/],
        ['a required raw not among the supporting records', (d) => { d.entries[0].requiredRawRecord = 'raw:z'; }, /requiredRawRecord must be one of supportingRecords/],
        ['a missing required-raw field', (d) => { delete d.entries[0].requiredRawRecord; }, /requiredRawRecord/],
        ['a claim without a description', (d) => { d.entries[0].mustClaims[0].description = ''; }, /mustClaims\[0\]\.description/],
        ['an invalid pattern', (d) => { d.entries[0].mustNotClaims.push({ description: 'x', pattern: '(' }); }, /mustNotClaims\[0\]\.pattern is not a valid regular expression/],
        ['no claims at all', (d) => { d.entries[0].mustClaims = []; }, /needs at least one mustClaims or mustNotClaims/],
        ['no evidence', (d) => { delete d.entries[0].evidence; }, /evidence must be a non-empty string/],
        ['a non-boolean acceptDecline', (d) => { d.entries[0].acceptDecline = 'yes'; }, /acceptDecline must be true or false/],
    ])('reports %s', (label, mutate, problem) => {
        const data = valid();
        mutate(data);
        expect(validateGold(data).join('\n')).toMatch(problem);
    });
});

// The checked-in entries' claim patterns, on answers a reviewer decided
// should or shouldn't count.
describe('gold claim patterns', () => {
    const gold = loadGold(GOLD_FILE);
    const entry = (id) => gold.entries.find((e) => e.id === id);
    const matches = (claim, answer) => new RegExp(claim.pattern, 'i').test(claimText(answer));
    const anyForbidden = (id, answer) => entry(id).mustNotClaims.filter((claim) => matches(claim, answer)).map((c) => c.description);

    it('has every entry reviewed', () => {
        expect(gold.entries.filter((e) => e.status !== 'reviewed').map((e) => e.id)).toEqual([]);
    });

    describe('onboarding-invite-worry', () => {
        const [worry] = entry('onboarding-invite-worry').mustClaims;

        it('accepts the worry, stated as a worry', () => {
            expect(matches(worry, 'New admins were worried that the invites would email their whole team before they were ready [1].')).toBe(true);
            expect(matches(worry, 'Admins were unsure whether invites send immediately or only when setup is finished [1].')).toBe(true);
        });

        it('doesn’t reward stating it as a fact', () => {
            expect(matches(worry, 'The invites emailed the whole team before the admins were ready [1].')).toBe(false);
        });
    });

    describe('onboarding-required-steps', () => {
        const [required] = entry('onboarding-required-steps').mustClaims;

        it('accepts the raw note’s “step 2 (calendar) can’t be skipped” and doesn’t forbid it', () => {
            const answer = 'Step 2 (calendar) can’t be skipped: a participant who tried hit the "required" indicator [1].';
            expect(matches(required, answer)).toBe(true);
            expect(anyForbidden('onboarding-required-steps', answer)).toEqual([]);
        });

        it('accepts step 3 (Connect calendar) is required', () => {
            expect(matches(required, 'Step 3 ("Connect calendar") is required [1].')).toBe(true);
        });

        it('forbids “Step 2 (Basics) can be skipped”', () => {
            expect(anyForbidden('onboarding-required-steps', 'Step 2 ("Basics") can be skipped.')).toEqual([
                expect.stringMatching(/^Says Basics or Signup can be skipped/),
            ]);
        });

        it('forbids step 4 required and all other steps required, but not a bare “2”', () => {
            expect(anyForbidden('onboarding-required-steps', 'Step 4 (Invite your team) is required [1].')).toHaveLength(1);
            expect(anyForbidden('onboarding-required-steps', 'All other steps are required [1].')).toHaveLength(1);
            expect(anyForbidden('onboarding-required-steps', '2 of 3 participants tried to skip the calendar step, which is optional-looking but required [1].')).toEqual([]);
        });
    });

    describe('audit-burnout-share', () => {
        const [noRate, physicians] = entry('audit-burnout-share').mustClaims;

        it('keeps the no-rate claim and adds the physicians’ 52%', () => {
            expect(matches(noRate, 'The sources do not give a burnout rate.')).toBe(true);
            expect(matches(physicians, 'No burnout rate is reported, but 52% of physicians named documentation burden as the top contributor [1].')).toBe(true);
            expect(matches(physicians, 'No rate is reported; 52 percent of physicians ranked documentation first [1].')).toBe(true);
        });

        it('needs physicians and documentation, not clinicians', () => {
            expect(matches(physicians, '52% of clinicians named documentation burden as the top contributor [1].')).toBe(false);
            expect(matches(physicians, '52% of physicians named patient volume [1].')).toBe(false);
        });
    });

    describe('audit-onboarding-steps-order', () => {
        const [order] = entry('audit-onboarding-steps-order').mustClaims;
        const steps = (last) => `1. Signup\n2. Basics (workspace name, team size)\n3. Connect calendar\n4. Invite your team\n5. Preferences\n6. ${last}\n[1]`;

        it('accepts “Review & finish” as the last step', () => {
            expect(matches(order, steps('Review & finish'))).toBe(true);
        });

        it('accepts just “Review” as the last step', () => {
            expect(matches(order, steps('Review'))).toBe(true);
        });
    });
});

describe('eval checks', () => {
    const src = (recordId, recordKind, excerpt) => ({ recordId, recordKind, excerpt });

    it('treats a trailing marker line as a group citation for the list above it', () => {
        const sentences = answerSentences('1. Signup\n2. Basics\n[1][2]');
        expect(sentences).toEqual([
            { text: 'Signup', markers: [], listItem: true, groupMarkers: [1, 2] },
            { text: 'Basics', markers: [], listItem: true, groupMarkers: [1, 2] },
        ]);
    });

    it('exempts declines, list intros and group-cited items, and flags the rest as uncited', () => {
        const sources = [src('finding:a', 'finding', 'Step 3 is required.')];
        const exempt = (answer) => analyseAnswer(answer, sources).map((s) => s.exempt || (s.uncited ? 'UNCITED' : 'cited'));
        expect(exempt('The sources do not say what percentage of clinicians report burnout.')).toEqual(['decline']);
        expect(exempt('The required steps are: [1]\n- Connect calendar')).toEqual(['cited', 'group-cited list item']);
        expect(exempt('The steps are:\n- Signup\n- Basics')).toEqual(['list intro', 'UNCITED', 'UNCITED']);
        expect(exempt('Step 3 is required [1]. Step 2 can be skipped.')).toEqual(['cited', 'UNCITED']);
    });

    it('checks each figure against that sentence’s own citations, not all of them', () => {
        const sources = [
            src('raw:a', 'raw', '5 of 6 participants recognized the flag.'),
            src('finding:b', 'finding', 'Participants liked the placement.'),
        ];
        const [first, second] = analyseAnswer('5 of 6 recognized it [1]. 5 of 6 liked the placement [2].', sources);
        expect(first.unsupported).toEqual([]);
        expect(second.unsupported).toEqual(['5', '6', '"5 of 6"']);
    });

    it('lets a decline repeat the question’s own figures', () => {
        const [decline] = analyseAnswer('The sources do not describe the step 3 wireframe.', [], 'What does the step 3 wireframe show?');
        expect(decline.unsupported).toEqual([]);
    });

    it('counts stacks of three or more citations', () => {
        const sources = ['a', 'b', 'c'].map((id) => src(`finding:${id}`, 'finding', 'It is 10 minutes.'));
        const [sentence] = analyseAnswer('It is 10 minutes. [1][2][3]', sources);
        expect(sentence.stack).toBe(3);
    });

    describe('judgeRun', () => {
        const entry = {
            id: 'q',
            question: 'Which steps are required?',
            supportingRecords: ['raw:a', 'finding:b'],
            requiredRawRecord: 'raw:a',
            mustClaims: [{ description: 'step 3 required', pattern: 'step 3[^.]*required' }],
            mustNotClaims: [{ description: 'step 2 skippable', pattern: 'step 2[^.]*skipped' }],
        };
        const sources = [src('finding:b', 'finding', 'Step 3 is required.'), src('raw:a', 'raw', 'Session 2 hit the “required” indicator at step 3.')];

        it('passes a fully supported answer', () => {
            const verdict = judgeRun(entry, { answer: 'Step 3 is required [1][2].', sources });
            expect(verdict).toMatchObject({ pass: true, failures: [], citesRaw: true, cited: ['finding:b', 'raw:a'] });
        });

        it('says why a run fails', () => {
            const verdict = judgeRun(entry, { answer: 'Step 3 is required [1]. Step 2 can be skipped.', sources: [sources[0]] });
            expect(verdict.pass).toBe(false);
            expect(verdict.failures).toEqual([
                '1 uncited sentence(s)',
                "figure(s) not in their sentence's cited excerpts: 2",
                "doesn't cite raw:a",
                'forbidden: step 2 skippable',
            ]);
        });

        it('fails a decline that cites nothing, and a missing claim', () => {
            const verdict = judgeRun(entry, { answer: 'The sources do not say which steps are required.', sources: [] });
            expect(verdict.failures).toEqual(['cites no supporting record', "doesn't cite raw:a", 'missing: step 3 required']);
        });

        describe('acceptDecline', () => {
            const unanswerable = {
                id: 'burnout',
                question: 'What percentage of clinicians report burnout?',
                supportingRecords: ['raw:survey'],
                requiredRawRecord: null,
                mustClaims: [{ description: 'no rate given', pattern: '\\b(no|not)\\b[^.]*\\b(rate|percentage)' }],
                mustNotClaims: [{ description: '52% burnout rate', pattern: '52\\s?%[^.]*burnout' }],
            };
            const decline = { answer: 'The sources do not say what percentage of clinicians report burnout.', sources: [] };

            it('passes a decline that cites nothing when the entry accepts one', () => {
                expect(judgeRun({ ...unanswerable, acceptDecline: true }, decline)).toMatchObject({ pass: true, failures: [], declineAccepted: true });
            });

            it('still fails the same decline on an entry without the flag', () => {
                const verdict = judgeRun(unanswerable, decline);
                expect(verdict).toMatchObject({ pass: false, failures: ['cites no supporting record'], declineAccepted: false });
            });

            it('still runs the must and must-not claims on an accepted decline', () => {
                const accepting = { ...unanswerable, acceptDecline: true };
                const missing = judgeRun(accepting, { answer: "The sources don't cover burnout.", sources: [] });
                expect(missing.failures).toEqual(['missing: no rate given']);
                const forbidden = judgeRun(accepting, { answer: 'The sources do not give a rate, though 52% burnout is mentioned.', sources: [] });
                expect(forbidden.failures).toEqual(expect.arrayContaining(['forbidden: 52% burnout rate']));
            });

            it('only excuses an answer made entirely of declines', () => {
                const verdict = judgeRun({ ...unanswerable, acceptDecline: true }, {
                    answer: 'The sources do not say what percentage of clinicians report burnout. Most clinicians are burned out.',
                    sources: [],
                });
                expect(verdict.failures).toEqual(['1 uncited sentence(s)', 'cites no supporting record']);
            });
        });
    });
});

describe('capture/eval chat option overrides', () => {
    it('adds only the options given, on top of the pipeline\'s', async () => {
        const calls = [];
        const ollama = { chatModel: 'm', chat: async (messages, options) => { calls.push(options); return 'ok'; } };
        expect(withChatOptions(ollama, chatOverrides({ seed: null, temperature: null }))).toBe(ollama);
        await withChatOptions(ollama, chatOverrides({ seed: 42, temperature: null })).chat([], { temperature: 0.2, num_ctx: 8192 });
        await withChatOptions(ollama, chatOverrides({ seed: null, temperature: 0 })).chat([], { temperature: 0.2, num_ctx: 8192 });
        expect(calls).toEqual([{ temperature: 0.2, num_ctx: 8192, seed: 42 }, { temperature: 0, num_ctx: 8192 }]);
    });
});
