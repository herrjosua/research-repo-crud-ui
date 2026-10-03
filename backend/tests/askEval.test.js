const { GOLD_FILE, loadGold, validateGold } = require('../ask/eval/gold');
const { answerSentences, analyseAnswer } = require('../ask/checks');
const {
    judgeRun, claimText, renderReport, renderComparison, parseArgs, withBehaviors, thinkRequest, withPromptSources, runRetrieval,
} = require('../scripts/eval-ask');
const { createOllamaClient, finalAnswer } = require('../ask/ollama');
const { withChatOptions, chatOverrides } = require('../scripts/capture-static-answers');
const { PROMPT_BEHAVIORS } = require('../ask/answer');

// The evaluation gold set (ask/eval/gold.json) and the harness's pass/fail
// rules (scripts/eval-ask.js, on ask/checks.js; tests/askChecks.test.js
// covers the checks themselves). Running the harness itself needs Ollama; see
// backend/README.md, "Evaluating answers".

describe('gold set', () => {
    it('the checked-in file is valid', () => {
        expect(() => loadGold(GOLD_FILE)).not.toThrow();
    });

    const valid = () => ({
        version: 1,
        entries: [{
            id: 'q',
            set: 'regression',
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
        ['a missing set', (d) => { delete d.entries[0].set; }, /set must be one of regression, scenario/],
        ['an unknown set', (d) => { d.entries[0].set = 'smoke'; }, /set must be one of regression, scenario/],
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
        expect(gold.entries.filter((e) => e.set === 'regression')).toHaveLength(10);
        expect(gold.entries.filter((e) => e.set === 'scenario')).toHaveLength(7);
        expect(gold.entries.filter((e) => e.status !== 'reviewed').map((e) => e.id)).toEqual([]);
    });

    // The open-questions entries: a decline must fail, so none may accept one.
    it('accepts no decline on a scenario entry', () => {
        expect(gold.entries.filter((e) => e.set === 'scenario' && e.acceptDecline).map((e) => e.id)).toEqual([]);
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

    describe('scenario-documentation-pain-points', () => {
        const [afterHours, beyond] = entry('scenario-documentation-pain-points').mustClaims;

        it('doesn’t count cross-referencing several systems as a documentation pain point', () => {
            const answer = 'Physicians finish notes after clinic hours [1]. Coordinators cross-reference several systems before each call [2].';
            expect(matches(afterHours, answer)).toBe(true);
            expect(matches(beyond, answer)).toBe(false);
        });

        it('counts re-entering the same fields and the underlying EHR problems', () => {
            expect(matches(beyond, 'Clerks re-type the same sixteen fields [1].')).toBe(true);
            expect(matches(beyond, 'One asked not to skip fixing the actual EHR problems [1].')).toBe(true);
        });
    });

    describe('scenario-calendar-premise', () => {
        const [already, noRecord] = entry('scenario-calendar-premise').mustClaims;

        it('accepts a premise check that says the step is already required and nothing argues for it', () => {
            const answer = 'The calendar step is already required [1]. No record argues for making it required: the skip attempts support labeling it clearly [2].';
            expect(matches(already, answer)).toBe(true);
            expect(matches(noRecord, answer)).toBe(true);
            expect(anyForbidden('scenario-calendar-premise', answer)).toEqual([]);
        });

        it('doesn’t count “even though it’s required” as the premise check', () => {
            expect(matches(already, '2 of 3 tried to skip step 3, assuming it was optional even though it’s required [1].')).toBe(false);
        });

        it('forbids presenting skip attempts as support for requiring it', () => {
            expect(anyForbidden('scenario-calendar-premise', 'The evidence supporting making the calendar step required includes skip attempts [1].')).toHaveLength(1);
            expect(anyForbidden('scenario-calendar-premise', 'Participants tried to skip it, which shows why it needs to be required [1].')).toHaveLength(1);
            expect(anyForbidden('scenario-calendar-premise', 'The skip attempts support clearer labeling, not making it required [1].')).toEqual([]);
        });
    });

    describe('scenario-care-coordinator-gaps', () => {
        const gaps = entry('scenario-care-coordinator-gaps');
        const sources = [{ recordId: 'raw:2025-01-29-contextual-inquiry-chart-review-baseline', recordKind: 'raw', excerpt: 'Revisit with float-pool coordinators. Quantify how often the AVS tool has missed medication changes. Coordinators manually cross-reference 3-4 systems.' }];

        it('fails a bare decline', () => {
            const verdict = judgeRun(gaps, { answer: 'The sources do not say what hasn’t been learned about care coordinators.', sources: [] });
            expect(verdict.pass).toBe(false);
            expect(verdict.failures).toEqual(expect.arrayContaining(['cites no supporting record', expect.stringMatching(/^forbidden: Declines/)]));
        });

        it('passes the open items with citations and what the data shows', () => {
            const answer = 'Open questions remain: how float-pool coordinators differ, and how often the AVS tool has missed medication changes [1]. What the data shows: coordinators cross-reference 3-4 systems before each call [1].';
            expect(judgeRun(gaps, { answer, sources })).toMatchObject({ pass: true, failures: [] });
        });
    });

    describe('scenario-session-timeout-open', () => {
        const [dispute, badge] = entry('scenario-session-timeout-open').mustClaims;

        it('needs the dispute named, not just “this dispute”', () => {
            expect(matches(dispute, 'The raw notes don’t say whether the 10-minute idle timeout settles this dispute [1].')).toBe(false);
            expect(matches(dispute, 'Security wanted 15 minutes and clinical ops wanted 4 hours; the records don’t say who won [1].')).toBe(true);
            expect(matches(dispute, 'Nothing records how the disagreement with clinical ops ended; it is unresolved [1].')).toBe(true);
        });

        it('keys badge-tap on the topic', () => {
            expect(matches(badge, 'Nobody confirmed the MFA plan works with badge-tap hardware [1].')).toBe(true);
        });

        it('forbids a decline', () => {
            expect(anyForbidden('scenario-session-timeout-open', 'The sources don’t say what is unresolved about the session timeout.')).toHaveLength(1);
        });
    });

    describe('scenario-invite-expectation', () => {
        it('forbids generalizing session 3’s worry to every participant', () => {
            expect(anyForbidden('scenario-invite-expectation', 'All participants worried the invites would email the team immediately [1].')).toHaveLength(1);
            expect(anyForbidden('scenario-invite-expectation', 'One admin worried the invites would email the whole team before they were ready [1].')).toEqual([]);
        });
    });

    describe('scenario-scribe-trust', () => {
        it('forbids saying the accuracy fixes restored trust, across a version number', () => {
            expect(anyForbidden('scenario-scribe-trust', 'Accuracy fixes in v0.2 restored trust [1].')).toHaveLength(1);
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
        expect(second.unsupported).toEqual(['5', '6', '5 of 6']);
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
                "figure(s) not in their sentence's cited sources: 2",
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

    it('applies them to chatDetailed() too, which the pipeline calls when the client has it', async () => {
        const calls = [];
        const ollama = {
            chatModel: 'm',
            chat: async () => 'ok',
            chatDetailed: async (messages, options) => { calls.push(options); return { content: 'ok', thinking: '', stats: null }; },
        };
        await withChatOptions(ollama, chatOverrides({ seed: 42, temperature: 0.2 })).chatDetailed([], { temperature: 0.5, num_ctx: 8192 });
        expect(calls).toEqual([{ temperature: 0.2, num_ctx: 8192, seed: 42 }]);
        expect(withChatOptions({ chat: async () => 'ok' }, { seed: 1 }).chatDetailed).toBeUndefined();
    });
});

describe('eval report', () => {
    const entry = (id, set) => ({
        id, set, status: set === 'scenario' ? 'draft' : 'reviewed', question: `${id}?`, project: null,
        supportingRecords: ['finding:a'], requiredRawRecord: null,
        mustClaims: [{ description: 'says yes', pattern: 'yes' }], mustNotClaims: [], evidence: 'e',
    });
    const gold = { version: 1, entries: [entry('r1', 'regression'), entry('r2', 'regression'), entry('s1', 'scenario')] };
    const run = (answer) => ({ secs: 1, answer, sources: [{ id: 'finding:a#0', recordId: 'finding:a', recordKind: 'finding', title: 'A', section: null, excerpt: 'yes' }], shown: [{ n: 1, recordId: 'finding:a', kind: 'finding' }] });
    const question = (id, answer) => ({ id, question: `${id}?`, project: null, ranking: [], seeded: [run(answer)], unseeded: [] });
    const metadata = {
        harnessVersion: 1, label: 'x', createdAt: 't', corpusCommit: 'c', appCommit: 'a', model: 'm', embedModel: 'e',
        ollamaVersion: 'o', modelDigest: 'd', embedModelDigest: 'd', seed: 42, temperature: 0.2, chatOptions: {}, topK: 6, seededRuns: 1, unseededRuns: 0,
    };

    it('reports each gold set in its own section with its own pass count', () => {
        const report = renderReport([{ metadata, questions: [question('r1', 'yes [1].'), question('r2', 'no [1].'), question('s1', 'yes [1].')] }], gold);
        const section = (name) => report.slice(report.indexOf(`## ${name} set`), report.indexOf('\n## ', report.indexOf(`## ${name} set`) + 1));
        expect(section('Regression')).toContain('## Regression set (2 questions)');
        expect(section('Regression')).toContain('- Gold pass: 1 of 2');
        expect(section('Regression')).not.toContain('`s1`');
        expect(section('Scenario')).toContain('**1 of 1 scenario entries are still drafts**');
        expect(section('Scenario')).toContain('- Gold pass: 1 of 1');
    });

    it('leaves out a set the results don’t ask', () => {
        const report = renderReport([{ metadata, questions: [question('s1', 'yes [1].')] }], gold);
        expect(report).not.toContain('## Regression set');
        expect(report).toContain('## Scenario set (1 question)');
    });
});

describe('eval --model', () => {
    it('takes a model for this run only, and none by default', () => {
        expect(parseArgs(['run', '--label', 'x']).model).toBeNull();
        expect(parseArgs(['run', '--label', 'x', '--model', 'qwen3:32b']).model).toBe('qwen3:32b');
        expect(() => parseArgs(['run', '--label', 'x', '--model', 'bad model'])).toThrow(/--model/);
    });
});

describe('eval --whole-raw-notes', () => {
    it('takes a session count of at least 1, and none by default', () => {
        expect(parseArgs(['run', '--label', 'x']).wholeRawNotes).toBeNull();
        expect(parseArgs(['run', '--label', 'x', '--whole-raw-notes', '2']).wholeRawNotes).toBe(2);
        expect(() => parseArgs(['run', '--label', 'x', '--whole-raw-notes', '0'])).toThrow(/--whole-raw-notes/);
        expect(() => parseArgs(['run', '--label', 'x', '--whole-raw-notes', 'two'])).toThrow(/--whole-raw-notes/);
    });
});

describe('eval --follow-ups', () => {
    const { RETRIEVAL } = require('../ask/pipeline');

    it('takes shown or linked, and is unset by default', () => {
        expect(parseArgs(['run', '--label', 'x']).followUps).toBeNull();
        expect(parseArgs(['run', '--label', 'x', '--follow-ups', 'shown']).followUps).toBe('shown');
        expect(parseArgs(['run', '--label', 'x', '--follow-ups', 'linked']).followUps).toBe('linked');
        expect(() => parseArgs(['run', '--label', 'x', '--follow-ups', 'both'])).toThrow(/--follow-ups must be shown or linked/);
        expect(() => parseArgs(['run', '--label', 'x', '--follow-ups', 'false'])).toThrow(/--follow-ups/);
        expect(() => parseArgs(['run', '--label', 'x', '--follow-ups'])).toThrow(/--follow-ups needs a value/);
    });

    it("is recorded in the run's retrieval, and without it the retrieval is the default", () => {
        expect(runRetrieval({ wholeRawNotes: null, followUps: null })).toBe(RETRIEVAL);
        expect(runRetrieval({ wholeRawNotes: null, followUps: 'linked' })).toEqual({ ...RETRIEVAL, followUps: 'linked' });
        expect(runRetrieval({ wholeRawNotes: 4, followUps: 'shown' })).toEqual({ ...RETRIEVAL, wholeRawNotes: 4, followUps: 'shown' });
        expect(runRetrieval({ wholeRawNotes: 2, followUps: null })).toEqual({ ...RETRIEVAL, wholeRawNotes: 2 });
    });
});

describe('eval --behaviors', () => {
    it('takes none or prompt behavior names, and is unset by default', () => {
        expect(parseArgs(['run', '--label', 'x']).behaviors).toBeNull();
        expect(parseArgs(['run', '--label', 'x', '--behaviors', 'none']).behaviors).toEqual([]);
        expect(parseArgs(['run', '--label', 'x', '--behaviors', 'premise-check, list-format']).behaviors)
            .toEqual(['premise-check', 'list-format']);
        expect(() => parseArgs(['run', '--label', 'x', '--behaviors', 'premise'])).toThrow(/--behaviors takes none, or names from premise-check, open-items, decline-with-evidence, list-format/);
        expect(() => parseArgs(['run', '--label', 'x', '--behaviors', 'constructor'])).toThrow(/--behaviors/);
        expect(() => parseArgs(['run', '--label', 'x', '--behaviors', 'none,open-items'])).toThrow(/--behaviors/);
        expect(() => parseArgs(['run', '--label', 'x', '--behaviors', ','])).toThrow(/--behaviors/);
    });

    it('runs the defaults without it, and otherwise exactly the behaviors named', () => {
        expect(withBehaviors(null)).toBe(PROMPT_BEHAVIORS);
        expect(withBehaviors([])).toEqual({
            premiseCheck: false, openItems: false, declineWithEvidence: false, listFormat: false,
        });
        expect(withBehaviors(['open-items'])).toEqual({
            premiseCheck: false, openItems: true, declineWithEvidence: false, listFormat: false,
        });
    });
});

describe('eval --think', () => {
    it('takes a thinking level, and none by default', () => {
        expect(parseArgs(['run', '--label', 'x']).think).toBeNull();
        expect(parseArgs(['run', '--label', 'x', '--think', 'low']).think).toBe('low');
        expect(() => parseArgs(['run', '--label', 'x', '--think', 'false'])).toThrow(/--think/);
        expect(() => parseArgs(['run', '--label', 'x', '--think', 'Low!'])).toThrow(/--think/);
    });

    it('sends the same think value as before to models without levels', () => {
        expect(thinkRequest('gemma2:9b', ['completion'], null, null)).toBeUndefined();
        expect(thinkRequest('qwen3:32b', ['completion', 'tools', 'thinking'], [false, true], null)).toBe(false);
        expect(thinkRequest('qwen3:32b', ['completion', 'tools', 'thinking'], null, null)).toBe(false);
    });

    it('sends a level only to a model that takes it, and needs one where false isn\'t a value', () => {
        const levels = ['low', 'medium', 'high'];
        expect(thinkRequest('gpt-oss:20b', ['completion', 'thinking'], levels, 'low')).toBe('low');
        expect(() => thinkRequest('gpt-oss:20b', ['completion', 'thinking'], levels, 'max')).toThrow(/takes low, medium, high/);
        expect(() => thinkRequest('gpt-oss:20b', ['completion', 'thinking'], levels, null)).toThrow(/--think LEVEL/);
        expect(() => thinkRequest('gemma2:9b', ['completion'], null, 'low')).toThrow(/no thinking capability/);
    });
});

describe('thinking text', () => {
    it('keeps only the final answer after a leading think block', () => {
        expect(finalAnswer('<think>\nThe user wants…\n</think>\n\nThe answer [1].')).toBe('The answer [1].');
        expect(finalAnswer('The answer [1].')).toBe('The answer [1].');
        expect(finalAnswer('An answer that mentions <think>tags</think> later.')).toBe('An answer that mentions <think>tags</think> later.');
    });

    describe('the Ollama client', () => {
        const realFetch = global.fetch;
        let bodies;
        const reply = (message) => {
            global.fetch = jest.fn(async (url, init) => {
                bodies.push(JSON.parse(init.body));
                return {
                    ok: true,
                    text: async () => JSON.stringify({
                        message, prompt_eval_count: 10, eval_count: 20, eval_duration: 2e9, prompt_eval_duration: 1e9, load_duration: 0, total_duration: 3e9,
                    }),
                };
            });
        };
        beforeEach(() => { bodies = []; });
        afterEach(() => { global.fetch = realFetch; });

        it('sends no think parameter unless asked, so a model without thinking gets the same request', async () => {
            reply({ content: 'Answer [1].' });
            expect(await createOllamaClient().chat([], { temperature: 0.2 })).toBe('Answer [1].');
            expect(bodies[0]).toEqual({ model: 'gemma2:9b', messages: [], stream: false, options: { temperature: 0.2 } });
            await createOllamaClient({ chatModel: 'qwen3:32b', think: false }).chat([], {});
            expect(bodies[1].think).toBe(false);
        });

        it('returns only the answer, never the thinking, and reports the stats', async () => {
            reply({ content: 'Answer [1].', thinking: 'Let me think.' });
            const client = createOllamaClient();
            expect(await client.chat([], {})).toBe('Answer [1].');
            const detail = await client.chatDetailed([], {});
            expect(detail).toEqual({
                content: 'Answer [1].',
                thinking: 'Let me think.',
                stats: {
                    promptTokens: 10, evalTokens: 20, promptSecs: 1, evalSecs: 2, loadSecs: 0, totalSecs: 3,
                },
            });
            reply({ content: '<think>Hmm.</think>\nAnswer [1].' });
            expect(await client.chatDetailed([], {})).toMatchObject({ content: 'Answer [1].', thinking: 'Hmm.' });
        });
    });
});

describe('eval model comparison', () => {
    const entry = (id, set) => ({
        id, set, status: 'reviewed', question: `${id}?`, project: null,
        supportingRecords: ['raw:a', 'finding:b'], requiredRawRecord: 'raw:a',
        mustClaims: [{ description: 'says yes', pattern: 'yes' }], mustNotClaims: [], evidence: 'e',
    });
    const gold = { version: 1, entries: [entry('r1', 'regression'), entry('s1', 'scenario')] };
    const run = (answer) => ({
        secs: 2, answer, stats: { evalTokens: 30, evalSecs: 3 }, thinkingChars: 0,
        sources: [{ id: 'raw:a#0', recordId: 'raw:a', recordKind: 'raw', title: 'A', section: null, excerpt: 'yes' }],
        shown: [{ n: 1, recordId: 'raw:a', kind: 'raw', passage: 'raw:a#0' }],
    });
    const question = (id, answer) => ({ id, question: `${id}?`, project: null, ranking: [], seeded: [run(answer)], unseeded: [run(answer)] });
    const metadata = (label, model) => ({
        harnessVersion: 1, label, createdAt: 't', corpusCommit: 'c', appCommit: 'a', model, embedModel: 'e',
        ollamaVersion: 'o', modelDigest: 'd', embedModelDigest: 'd', seed: 42, temperature: 0.2, chatOptions: {}, topK: 6, seededRuns: 1, unseededRuns: 1,
    });

    it('puts each model side by side, a model’s two sets together, and lists entries failing on any model', () => {
        const report = renderComparison([
            { metadata: metadata('base', 'm1'), questions: [question('r1', 'yes [1].')] },
            { metadata: metadata('base-s', 'm1'), questions: [question('s1', 'yes [1].')] },
            { metadata: metadata('other', 'm2'), questions: [question('r1', 'no [1].'), question('s1', 'yes [1].')] },
        ], gold);
        expect(report).toContain('| Result sets | `base`, `base-s` | `other` |');
        expect(report).toContain('| `r1` | PASS (1/1) | **FAIL** (0/1) | required raw shown; 1 of 2 supporting shown | yes |');
        expect(report).toContain('| Tokens per second, cold run, mean / max | 10 / 10 | 10 / 10 |');
        const failing = report.slice(report.indexOf('## Entries failing on any model'), report.indexOf('## Answers'));
        expect(failing).toContain('`r1`');
        expect(failing).not.toContain('`s1`');
        expect(report).not.toContain('different Ollama versions');
    });

    it('warns when the sets were run on different Ollama versions', () => {
        const report = renderComparison([
            { metadata: metadata('base', 'm1'), questions: [question('r1', 'yes [1].')] },
            { metadata: { ...metadata('other', 'm2'), ollamaVersion: 'o2' }, questions: [question('r1', 'yes [1].')] },
        ], gold);
        expect(report).toContain('⚠ The sets were run on different Ollama versions (o, o2).');
    });
});

describe('prompt sources for re-judging stored runs', () => {
    const promptSources = {
        corpusCommit: 'c',
        records: {
            'raw:a': { title: 'Session A', participants: 'Participants: 4 — Nurse', date: 'Apr 8, 2025' },
            'deliverable:flow': { title: 'Flow', participants: null, date: 'Feb 20, 2026' },
        },
        passages: {
            'raw:a#2': { title: 'Session A', section: 'Key Findings', participants: 'Participants: 4 — Nurse', excerpt: '4 nurses.', date: 'Apr 8, 2025' },
            'deliverable:flow#1': { title: 'Flow', section: 'Steps', participants: null, excerpt: 'Step 1\nStep 5', date: 'Feb 20, 2026' },
        },
    };
    const run = (shown) => ({
        answer: 'x', sources: [{ id: 'raw:a#2', recordId: 'raw:a', excerpt: '4 nurses.' }], shown,
    });
    const results = (shown) => ({ metadata: { label: 'l', corpusCommit: 'c' }, questions: [{ id: 'q', seeded: [run(shown)], unseeded: [] }] });

    it('adds the label date to cited sources and every shown source, without touching the stored run', () => {
        const stored = results([{ n: 1, recordId: 'raw:a', passage: 'raw:a#2' }, { n: 2, recordId: 'deliverable:flow', passage: 'deliverable:flow#1' }]);
        const copy = JSON.stringify(stored);
        const enriched = withPromptSources(stored, promptSources).questions[0].seeded[0];
        expect(enriched.sources[0].date).toBe('Apr 8, 2025');
        expect(enriched.shownSources.map((s) => s.excerpt)).toEqual(['4 nurses.', 'Step 1\nStep 5']);
        expect(JSON.stringify(stored)).toBe(copy);
    });

    it('gives a run stored without passage ids its shown records’ labels only', () => {
        const enriched = withPromptSources(results([{ n: 1, recordId: 'deliverable:flow' }]), promptSources).questions[0].seeded[0];
        expect(enriched.shownSources).toEqual([{ title: 'Flow', section: null, participants: null, excerpt: '', date: 'Feb 20, 2026' }]);
    });

    it('refuses a run whose shown passage it doesn’t have', () => {
        expect(() => withPromptSources(results([{ n: 1, recordId: 'raw:a', passage: 'raw:a#9' }]), promptSources)).toThrow(/raw:a#9 isn't in the prompt sources/);
    });

    it('lets an uncited decline’s figures come from the shown sources when judged', () => {
        const entry = {
            question: 'Which steps are required?', supportingRecords: ['raw:a'], requiredRawRecord: null, mustClaims: [], mustNotClaims: [],
        };
        const stored = results([{ n: 1, recordId: 'raw:a', passage: 'raw:a#2' }, { n: 2, recordId: 'deliverable:flow', passage: 'deliverable:flow#1' }]);
        stored.questions[0].seeded[0].answer = '4 nurses took part [1]. Step 5 is not described in the provided sources.';
        expect(judgeRun(entry, stored.questions[0].seeded[0]).unsupported).toEqual(['5']);
        expect(judgeRun(entry, withPromptSources(stored, promptSources).questions[0].seeded[0]).unsupported).toEqual([]);
    });
});

describe('claimText', () => {
    // model-gpt-oss-20b-low, audit-ai-readiness: "non‑clinical" with a
    // non-breaking hyphen missed the 34% claim until it was normalized.
    it('reads gpt-oss’s non-breaking hyphen and narrow no-break space as plain', () => {
        const [aware] = loadGold(GOLD_FILE).entries.find((e) => e.id === 'audit-ai-readiness').mustClaims;
        const answer = 'Only 34 % of non‑clinical staff were aware [1].';
        expect(claimText(answer)).toContain('Only 34 % of non-clinical staff were aware');
        expect(new RegExp(aware.pattern, 'i').test(claimText(answer))).toBe(true);
    });
});
