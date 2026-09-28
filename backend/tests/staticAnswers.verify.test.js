const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { verifyAnswers } = require('../scripts/capture-static-answers');
const { createTestRepo, destroyTestRepo } = require('./helpers/setupTestRepo');

// The capture script's verify command: do the published answers still match
// a checkout? Unit tests of the check, then the command itself against a
// throwaway repo built from the projects fixture corpus, with answers files
// (tests/fixtures/static-answers/verify-*.json) that cite its records.

const execFileAsync = promisify(execFile);
const SCRIPT = path.join(__dirname, '..', 'scripts', 'capture-static-answers.js');
const FIXTURES = path.join(__dirname, 'fixtures', 'static-answers');
const CORPUS_DIR = path.join(__dirname, 'fixtures', 'projects-corpus');

describe('verifyAnswers', () => {
    const records = [
        { id: 'raw:a', html: '<h2>Findings</h2><p>Physicians read   every line.</p><ul><li>3 of 5 sessions\nhad errors.</li></ul>' },
        { id: 'finding:b', html: '<p>Coders &amp; billers wanted the chart text.</p>' },
    ];
    const answers = (sources) => ({ questions: [{ id: 'q', sources }] });

    it('passes excerpts that are still in their records, across blocks and whitespace changes', () => {
        const data = answers([
            { recordId: 'raw:a', excerpt: 'Physicians read every line.\n3 of 5 sessions had errors.' },
            { recordId: 'finding:b', excerpt: 'Coders & billers wanted the chart text.' },
        ]);
        expect(verifyAnswers(data, records)).toEqual([]);
    });

    it('reports a missing record and an excerpt its record no longer contains, with their citation numbers', () => {
        const data = answers([
            { recordId: 'raw:a', excerpt: 'Physicians read every line.' },
            { recordId: 'raw:gone', excerpt: 'Anything.' },
            { recordId: 'finding:b', excerpt: 'Coders wanted the chart text.' },
        ]);
        expect(verifyAnswers(data, records)).toEqual([
            { questionId: 'q', n: 2, recordId: 'raw:gone', problem: 'record no longer exists' },
            { questionId: 'q', n: 3, recordId: 'finding:b', problem: 'excerpt no longer appears in the record' },
        ]);
    });

    it('does not match a heading as part of the record text', () => {
        expect(verifyAnswers(answers([{ recordId: 'raw:a', excerpt: 'Findings Physicians read' }]), records))
            .toEqual([expect.objectContaining({ n: 1, problem: 'excerpt no longer appears in the record' })]);
    });
});

describe('capture-static-answers.js verify', () => {
    let repo;

    beforeAll(() => {
        // PYTHON_BIN, for export_records.py, the way app.js loads it.
        require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
        repo = createTestRepo({ corpusDir: CORPUS_DIR });
    });

    afterAll(async () => {
        await destroyTestRepo(repo);
    });

    function runVerify(fixture) {
        return execFileAsync(process.execPath, [SCRIPT, 'verify', '--answers', path.join(FIXTURES, fixture)], {
            env: { ...process.env, AGENTIC_REPO_ROOT: repo },
        });
    }

    it('exits 0 when every cited record and excerpt is still there', async () => {
        const { stdout } = await runVerify('verify-ok.json');
        expect(stdout).toMatch(/^OK: all 2 cited source\(s\) in 1 answer\(s\) match/);
    });

    it('prints each miss and exits non-zero when a record or excerpt is gone', async () => {
        const err = await runVerify('verify-misses.json').then(() => null, (e) => e);

        expect(err).not.toBeNull();
        expect(err.code).toBe(1);
        expect(err.stdout.trim().split('\n')).toEqual([
            'MISS edited-excerpt [1] finding:onboarding: excerpt no longer appears in the record',
            'MISS deleted-record [1] raw:2026-01-02-retired-survey: record no longer exists',
            expect.stringMatching(/^2 of 5 cited source\(s\) no longer match/),
        ]);
    });

    it('refuses an invalid answers file', async () => {
        const err = await execFileAsync(process.execPath, [SCRIPT, 'verify', '--answers', path.join(CORPUS_DIR, 'README.md')], {
            env: { ...process.env, AGENTIC_REPO_ROOT: repo },
        }).then(() => null, (e) => e);

        expect(err.code).toBe(1);
        expect(err.stderr).toMatch(/needs a valid answers file/);
    });
});
