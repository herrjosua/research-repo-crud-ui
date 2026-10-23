const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    parseArgs, threeThenFive, askByPassRule, callCost, readPassRule, checkIdentity, bedrockMetadata, runBedrock, checkComparable,
    renderReport, renderComparison, BEDROCK_PRICING, PASS_RULE_ID, EVAL_HARNESS_VERSION,
} = require('../scripts/eval-ask');
const { BEDROCK_MODELS } = require('../ask/bedrock');
const { RETRIEVAL } = require('../ask/pipeline');
const { PROMPT_BEHAVIORS } = require('../ask/answer');

// The evaluation harness's --provider bedrock (scripts/eval-ask.js): its
// refusals, the three-then-five pass rule, the cost guard, the identity pin,
// and reports on Bedrock sets. Nothing here calls Bedrock, STS or Ollama.

const SONNET = 'global.anthropic.claude-sonnet-5-5';
const GPT_OSS = 'openai.gpt-oss-20b-1:0';
const HASH = 'a'.repeat(64);
const bedrockRun = ['run', '--provider', 'bedrock', '--label', 'x', '--max-cost', '1', '--pass-rule-file', 'rule.md', '--pass-rule-sha256', HASH];

describe('eval --provider', () => {
    it('is ollama by default, with nothing Bedrock-only', () => {
        expect(parseArgs(['run', '--label', 'x'])).toMatchObject({
            provider: 'ollama', maxCost: null, passRuleFile: null, passRuleSha256: null, acrossSettings: false,
        });
        expect(() => parseArgs(['run', '--label', 'x', '--provider', 'openai'])).toThrow(/--provider must be ollama or bedrock/);
    });

    it('takes bedrock with --max-cost and the pass-rule file and hash', () => {
        expect(parseArgs([...bedrockRun, '--only', 'a,b'])).toMatchObject({
            provider: 'bedrock', maxCost: 1, passRuleFile: 'rule.md', passRuleSha256: HASH, only: ['a', 'b'],
        });
    });

    it.each([['--seed', '42'], ['--temperature', '0.2'], ['--seeded-runs', '3'], ['--unseeded-runs', '0'], ['--think', 'low']])('refuses %s with bedrock', (flag, value) => {
        expect(() => parseArgs([...bedrockRun, flag, value])).toThrow(new RegExp(`--provider bedrock refuses ${flag}`));
    });

    it('needs --max-cost and the pass rule with bedrock', () => {
        expect(() => parseArgs(['run', '--provider', 'bedrock', '--label', 'x', '--pass-rule-file', 'r', '--pass-rule-sha256', HASH])).toThrow(/needs --max-cost USD/);
        expect(() => parseArgs(['run', '--provider', 'bedrock', '--label', 'x', '--max-cost', '1'])).toThrow(/needs --pass-rule-file PATH and --pass-rule-sha256 HASH/);
        expect(() => parseArgs([...bedrockRun.slice(0, 5), '--max-cost', '0'])).toThrow(/--max-cost must be/);
        expect(() => parseArgs([...bedrockRun.slice(0, 10), 'abc'])).toThrow(/64 hex characters/);
    });

    it('refuses the Bedrock-only flags without bedrock', () => {
        expect(() => parseArgs(['run', '--label', 'x', '--max-cost', '1'])).toThrow(/--max-cost: only with --provider bedrock/);
    });

    it('takes --across-settings for report and compare', () => {
        expect(parseArgs(['report', 'a', 'b', '--across-settings'])).toMatchObject({ labels: ['a', 'b'], acrossSettings: true });
    });
});

describe('the three-then-five pass rule', () => {
    it.each([
        [[true, true, true], { pass: true, n: 3, passes: 3, needed: 3 }],
        [[false, false, false], { pass: false, n: 3, passes: 0, needed: 3 }],
        [[true, true, false, true, false], { pass: true, n: 5, passes: 3, needed: 5 }],
        [[true, false, true, false, false], { pass: false, n: 5, passes: 2, needed: 5 }],
        [[false, true, false, true, true], { pass: true, n: 5, passes: 3, needed: 5 }],
        [[true, false, false, false, false], { pass: false, n: 5, passes: 1, needed: 5 }],
    ])('judges %j', (outcomes, verdict) => {
        expect(threeThenFive(outcomes)).toEqual(verdict);
    });

    it('needs 3 runs, then 5 only on a split, and ignores runs beyond that', () => {
        expect(threeThenFive([])).toMatchObject({ pass: null, needed: 3 });
        expect(threeThenFive([true, false])).toMatchObject({ pass: null, needed: 3 });
        expect(threeThenFive([true, true, false])).toMatchObject({ pass: null, needed: 5 });
        expect(threeThenFive([true, true, true, false, false])).toEqual({ pass: true, n: 3, passes: 3, needed: 3 });
    });

    const asker = (outcomes, cost = 0.01) => {
        const queue = [...outcomes];
        return jest.fn(async () => {
            const next = queue.shift();
            if (next instanceof Error) return { error: next, cost: 0 };
            return { run: { answer: String(next) }, pass: next, cost };
        });
    };
    const budget = (limitUsd = 100) => ({ limitUsd, spentUsd: 0 });

    it.each([
        ['3-0', [true, true, true], 3, true],
        ['0-3', [false, false, false], 3, false],
        ['2-1 then 2 more', [true, true, false, false, true], 5, true],
        ['1-2 then 2 more', [false, true, false, false, true], 5, false],
    ])('asks %s', async (_, outcomes, calls, pass) => {
        const ask = asker(outcomes);
        const result = await askByPassRule(ask, budget());
        expect(ask).toHaveBeenCalledTimes(calls);
        expect(result.runs).toHaveLength(calls);
        expect(result.stopped).toBe(false);
        expect(threeThenFive(result.outcomes).pass).toBe(pass);
    });

    it('re-runs an errored run once, and counts it a fail when that errors too', async () => {
        const ask = asker([new Error('Bedrock ThrottlingException (HTTP 429): throttled'), true, new Error('a'), new Error('b'), true, true, false]);
        const result = await askByPassRule(ask, budget());
        // Five runs (2-1 after three, so two more), seven calls.
        expect(ask).toHaveBeenCalledTimes(7);
        expect(result.outcomes).toEqual([true, false, true, true, false]);
        expect(result.runs[0]).toMatchObject({ answer: 'true', erroredFirst: 'Bedrock ThrottlingException (HTTP 429): throttled' });
        expect(result.runs[1]).toEqual({ error: 'b', errors: ['a', 'b'], rerun: true, cost: 0 });
        expect(threeThenFive(result.outcomes)).toMatchObject({ pass: true, n: 5, passes: 3 });
    });
});

describe('the cost guard', () => {
    it('stops before a call once the running total reaches the limit', async () => {
        const ask = jest.fn(async () => ({ run: {}, pass: ask.mock.calls.length !== 2, cost: 0.4 }));
        const spend = { limitUsd: 1, spentUsd: 0 };
        // 2-1 after three calls ($1.20), so the rule wants a fourth: not started.
        const result = await askByPassRule(ask, spend);
        expect(ask).toHaveBeenCalledTimes(3);
        expect(result).toMatchObject({ stopped: true, outcomes: [true, false, true] });
        expect(spend.spentUsd).toBeCloseTo(1.2);
        // A later entry starts nothing.
        const next = jest.fn();
        expect(await askByPassRule(next, spend)).toEqual({ runs: [], outcomes: [], stopped: true });
        expect(next).not.toHaveBeenCalled();
    });

    it('does not start the re-run of an errored call over the limit', async () => {
        const ask = jest.fn(async () => ({ error: new Error('Bedrock stopped at max_tokens'), cost: 2 }));
        const result = await askByPassRule(ask, { limitUsd: 1, spentUsd: 0 });
        expect(ask).toHaveBeenCalledTimes(1);
        expect(result.stopped).toBe(true);
        expect(result.runs[0]).toMatchObject({ error: 'Bedrock stopped at max_tokens', rerun: false });
    });

    it('prices a call from its input and output tokens', () => {
        expect(callCost({ inputTokens: 1_000_000, outputTokens: 100_000 }, BEDROCK_PRICING[SONNET])).toBeCloseTo(2 + 1);
        expect(callCost({ inputTokens: 5000, outputTokens: 209 }, BEDROCK_PRICING[GPT_OSS])).toBeCloseTo((5000 * 0.07 + 209 * 0.3) / 1e6, 12);
        expect(() => callCost({ inputTokens: null, outputTokens: 1 }, BEDROCK_PRICING[SONNET])).toThrow(/no token usage/);
    });

    it('has a price for every model in the table', () => {
        expect(Object.keys(BEDROCK_PRICING).sort()).toEqual(Object.keys(BEDROCK_MODELS).sort());
        expect(BEDROCK_PRICING['global.anthropic.claude-opus-5-5']).toEqual({ inputPerM: 4, outputPerM: 20 });
    });
});

describe('the pass-rule file', () => {
    let dir;
    beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-rule-')); });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    const write = (text) => {
        const file = path.join(dir, `${crypto.randomUUID()}.md`);
        fs.writeFileSync(file, text);
        return { file, sha256: crypto.createHash('sha256').update(text).digest('hex') };
    };

    it('records the hash and the text when they match', () => {
        const { file, sha256 } = write('Three runs; 2-1 or 1-2 runs two more.\n');
        expect(readPassRule(file, sha256.toUpperCase())).toEqual({ id: PASS_RULE_ID, sha256, text: 'Three runs; 2-1 or 1-2 runs two more.\n' });
    });

    it('refuses a file whose hash is not the one given', () => {
        const { file, sha256 } = write('rule');
        expect(() => readPassRule(file, HASH)).toThrow(`refusing to run: ${file} has SHA-256 ${sha256}, not ${HASH}`);
    });

    it('stops runBedrock before the identity check or any call', async () => {
        const { file } = write('rule');
        const saved = { ...process.env };
        process.env.AGENTIC_REPO_ROOT = dir;
        const deps = { getCallerArn: jest.fn(), send: jest.fn(), ollamaInfo: jest.fn() };
        await expect(runBedrock({
            label: 'x', model: SONNET, maxCost: 1, passRuleFile: file, passRuleSha256: HASH,
        }, deps)).rejects.toThrow(/refusing to run: .* has SHA-256/);
        expect(deps.getCallerArn).not.toHaveBeenCalled();
        expect(deps.send).not.toHaveBeenCalled();
        expect(deps.ollamaInfo).not.toHaveBeenCalled();
        process.env = saved;
    });

    it('stops runBedrock at the identity check, before Ollama or Bedrock', async () => {
        const { file, sha256 } = write('rule');
        const saved = { ...process.env };
        process.env.AGENTIC_REPO_ROOT = dir;
        const deps = { getCallerArn: jest.fn(async () => 'arn:aws:iam::111122223333:user/someone-else'), send: jest.fn(), ollamaInfo: jest.fn() };
        await expect(runBedrock({
            label: 'x', model: SONNET, maxCost: 1, passRuleFile: file, passRuleSha256: sha256,
        }, deps)).rejects.toThrow('refusing to run: the AWS identity is user/someone-else, not user/ux-research-demo');
        expect(deps.send).not.toHaveBeenCalled();
        expect(deps.ollamaInfo).not.toHaveBeenCalled();
        process.env = saved;
    });
});

describe('the identity pin', () => {
    it('accepts only the ux-research-demo IAM user, and never prints the account', async () => {
        await expect(checkIdentity(async () => 'arn:aws:iam::111122223333:user/ux-research-demo')).resolves.toBe('user/ux-research-demo');
        for (const arn of ['arn:aws:iam::111122223333:user/ux-research-demo-2', 'arn:aws:sts::111122223333:assumed-role/ux-research-demo/s', 'arn:aws:iam::111122223333:root']) {
            const err = await checkIdentity(async () => arn).catch((e) => e);
            expect(err.message).toMatch(/^refusing to run: the AWS identity is/);
            expect(err.message).not.toContain('111122223333');
        }
    });

    it('refuses when STS fails, without the error object', async () => {
        const failure = Object.assign(new Error('The security token included in the request is invalid. Credential=AKIAIOSFODNN7EXAMPLE/x'), { name: 'InvalidClientTokenId' });
        const err = await checkIdentity(async () => { throw failure; }).catch((e) => e);
        expect(err.message).toMatch(/^refusing to run: STS GetCallerIdentity failed \(InvalidClientTokenId: /);
        expect(err.message).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });
});

// A Bedrock result set as runBedrock stores it.
const bedrockClient = (modelId, effort) => ({
    chatModel: modelId, region: 'us-east-1', maxTokens: 4096, effort,
});
const passRule = { id: PASS_RULE_ID, sha256: 'b'.repeat(64), text: 'the rule' };
const bedrockSet = (label, questions, modelId = SONNET) => ({
    metadata: {
        ...bedrockMetadata({
            label,
            corpusCommit: 'c',
            appCommit: 'a',
            client: bedrockClient(modelId, modelId === GPT_OSS ? null : 'high'),
            embedModel: 'nomic-embed-text',
            embedModelDigest: 'e'.repeat(64),
            retrieval: RETRIEVAL,
            promptBehaviors: PROMPT_BEHAVIORS,
            passRule,
            pricing: BEDROCK_PRICING[modelId],
        }),
        wallSecs: 60,
        cost: {
            limitUsd: 1, totalUsd: 0.0123, stoppedAtLimit: false, notAsked: [], incomplete: [],
        },
    },
    questions,
});

describe('Bedrock set metadata', () => {
    it('has the Bedrock fields and none of the Ollama chat model ones', () => {
        const { metadata } = bedrockSet('b', [], SONNET);
        expect(metadata).toMatchObject({
            harnessVersion: EVAL_HARNESS_VERSION,
            provider: 'bedrock',
            model: SONNET,
            region: 'us-east-1',
            effort: 'high',
            maxTokens: 4096,
            temperature: 'not sent',
            seed: 'not supported',
            embedModel: 'nomic-embed-text',
            embedModelDigest: 'e'.repeat(64),
            runs: { rule: PASS_RULE_ID, first: 3, onSplit: 5, rerunsAfterError: 1 },
            passRule,
            pricing: {
                inputPerM: 2, outputPerM: 10, source: 'AWS Bedrock pricing page', asOf: '2026-10-23',
            },
        });
        expect(EVAL_HARNESS_VERSION).toBe(1);
        for (const key of ['modelDigest', 'ollamaVersion', 'memory', 'capabilities', 'thinking', 'seededRuns', 'unseededRuns']) {
            expect(metadata).not.toHaveProperty(key);
        }
        expect(typeof metadata.seed).toBe('string');
    });

    it('records effort "not sent" for gpt-oss', () => {
        expect(bedrockSet('g', [], GPT_OSS).metadata).toMatchObject({ effort: 'not sent', pricing: { inputPerM: 0.07, outputPerM: 0.3 } });
    });
});

describe('reports on Bedrock sets', () => {
    const entry = (id, set) => ({
        id, set, status: 'reviewed', question: `${id}?`, project: null,
        supportingRecords: ['finding:a'], requiredRawRecord: null,
        mustClaims: [{ description: 'says yes', pattern: 'yes' }], mustNotClaims: [], evidence: 'e',
    });
    const gold = { version: 1, entries: [entry('r1', 'regression'), entry('r2', 'regression'), entry('s1', 'scenario')] };
    const source = { id: 'finding:a#0', recordId: 'finding:a', recordKind: 'finding', title: 'A', section: null, excerpt: 'yes' };
    const run = (answer, extra = {}) => ({
        secs: 2, answer, usage: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 }, stopReason: 'end_turn', latencyMs: 1900, attempts: 1, cost: 0.004,
        sources: [source], shown: [{ n: 1, recordId: 'finding:a', kind: 'finding', passage: 'finding:a#0' }], ...extra,
    });
    const question = (id, runs) => ({ id, question: `${id}?`, project: null, ranking: [], runs });
    const failed = { error: 'Bedrock ThrottlingException (HTTP 429): throttled', errors: ['Bedrock ThrottlingException (HTTP 429): throttled', 'Bedrock ThrottlingException (HTTP 429): throttled'], rerun: true, cost: 0 };
    const set = bedrockSet('sonnet', [
        question('r1', [run('yes [1].'), run('yes [1].'), run('yes [1].', { thinkingChars: 40 })]),
        question('r2', [run('yes [1].'), failed, run('no [1].'), run('no [1].'), run('yes [1].')]),
        question('s1', [failed, failed, failed]),
    ]);

    it('renders without any Ollama field, judging each entry by the pass rule', () => {
        const report = renderReport([set], gold);
        expect(report).toContain(`| Chat model | ${SONNET} |`);
        expect(report).toContain('| Embedding model | nomic-embed-text @ eeeeeeeeeeee |');
        expect(report).toContain('| Ollama | — |');
        expect(report).toContain('| Seed / temperature | not supported / not sent |');
        expect(report).toContain('| Runs per question | three-then-five: 3, then 5 on a 2-1 split |');
        expect(report).toContain('| Provider | bedrock, us-east-1 |');
        expect(report).toContain('| Cost | $0.0123 of a $1 limit |');
        expect(report).toContain('- Gold pass: 1 of 2');
        expect(report).toContain('| `r1` | PASS (3/3) |');
        expect(report).toContain('| `r2` | **FAIL** (2/5) |');
        expect(report).toContain('| `s1` | **FAIL** (0/3) |');
        expect(report).toContain('- Runs that returned thinking text: 1');
        expect(report).toContain('| Errored runs | Bedrock ThrottlingException (HTTP 429): throttled |');
        expect(report).toContain('| Pass rule runs (N) | 2 of 5 runs pass; N=5 |');
        expect(report).toContain('| Seeded runs identical | — (no seed) |');
        expect(report).not.toMatch(/undefined|NaN/);
    });

    it('marks an entry whose stored runs fall short of the rule as incomplete, and a fail', () => {
        const report = renderReport([bedrockSet('short', [question('r1', [run('yes [1].'), run('no [1].'), run('yes [1].')])])], gold);
        expect(report).toContain('| `r1` | **FAIL** (2/3) |');
        expect(report).toContain('incomplete: the rule needs 5');
    });

    it('compares a Bedrock set with an Ollama one', () => {
        const ollama = {
            metadata: {
                harnessVersion: 1, label: 'gemma', createdAt: 't', corpusCommit: 'c', appCommit: 'a', model: 'gemma2:9b', embedModel: 'e',
                ollamaVersion: 'o', modelDigest: 'd'.repeat(64), embedModelDigest: 'e'.repeat(64), seed: 42, temperature: 0.2, chatOptions: {}, topK: 6, seededRuns: 1, unseededRuns: 1,
            },
            questions: ['r1', 'r2', 's1'].map((id) => ({
                id, question: `${id}?`, project: null, ranking: [], seeded: [run('yes [1].')], unseeded: [run('no [1].')],
            })),
        };
        const report = renderComparison([ollama, set], gold, { banner: '⚠ banner' });
        expect(report).toContain('| Model digest | dddddddddddd | — |');
        expect(report).toContain('| Ollama | o | — |');
        expect(report).toContain('| `r1` | PASS (0/1) | PASS (3/3) |');
        expect(report).toContain('| Provider | ollama | bedrock |');
        expect(report).toContain('⚠ banner');
        expect(report).not.toContain('different Ollama versions');
        expect(report).not.toMatch(/undefined|NaN/);
    });
});

describe('comparing across settings', () => {
    const ollama = (label, extra = {}) => ({
        metadata: {
            harnessVersion: 1, label, corpusCommit: 'c', model: 'gemma2:9b', seed: 42, temperature: 0.2, ...extra,
        },
    });
    const bedrock = bedrockSet('sonnet', []);

    it('refuses a Bedrock set against a seeded Ollama one by default', () => {
        expect(() => checkComparable(['gemma', 'sonnet'], [ollama('gemma'), bedrock]))
            .toThrow('gemma, sonnet differ in seed (42 vs not supported); re-run so they match, or pass --across-settings to compare them anyway');
    });

    it('refuses two providers even when seed and temperature match, a set without one being ollama', () => {
        const fake = { metadata: { ...ollama('o').metadata, provider: 'bedrock' } };
        expect(() => checkComparable(['o', 'f'], [ollama('o'), fake])).toThrow(/differ in provider \(ollama vs bedrock\)/);
        expect(checkComparable(['a', 'b'], [ollama('a'), ollama('b', { provider: 'ollama' })])).toBeNull();
    });

    it('allows it with --across-settings, with a banner listing every setting that differs', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const banner = checkComparable(['gemma', 'sonnet'], [ollama('gemma'), bedrock], { acrossSettings: true });
        expect(banner).toContain('these sets differ in seed, temperature, provider, model, region, effort, maxTokens, chatOptions, retrieval, promptBehaviors, passRule');
        expect(banner).toContain('- seed: `gemma` 42; `sonnet` not supported');
        expect(banner).toContain('- provider: `gemma` ollama; `sonnet` bedrock');
        expect(banner).toContain(`- passRule: \`gemma\` first seeded run; \`sonnet\` ${PASS_RULE_ID} bbbbbbbbbbbb`);
        expect(log).toHaveBeenCalledWith(banner);
        log.mockRestore();
    });

    it('still refuses a different corpus or harness version with --across-settings', () => {
        expect(() => checkComparable(['a', 'b'], [ollama('a'), ollama('b', { corpusCommit: 'd' })], { acrossSettings: true })).toThrow(/differ in corpusCommit/);
        expect(() => checkComparable(['a', 'b'], [ollama('a'), ollama('b', { harnessVersion: 2 })], { acrossSettings: true })).toThrow(/differ in harnessVersion/);
    });
});
