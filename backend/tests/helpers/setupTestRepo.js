const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { THROWAWAY_MARKER } = require('../../throwawayRepo');

// The Python scripts records.js shells out to, copied fresh into each fixture
// repo. export_records.py imports from build_search_ui.py, which in turn
// imports from build_index.py and md_render.py — all four have to come along
// even though records.js only calls export_records.py, build_index.py, and
// new_research_session.py directly.
const SCRIPT_FILES = [
    'new_research_session.py',
    'export_records.py',
    'build_index.py',
    'build_search_ui.py',
    'md_render.py',
];

// Where the REAL scripts live, so we know where to copy them FROM (read-only).
// REAL_AGENTIC_REPO_ROOT if set (CI sets it), else an agentic-repo checkout
// sitting next to this repo.
const REAL_AGENTIC_REPO_ROOT =
    process.env.REAL_AGENTIC_REPO_ROOT || path.resolve(__dirname, '../../../../agentic-repo');
const REAL_SCRIPTS_DIR = path.join(REAL_AGENTIC_REPO_ROOT, 'research', 'scripts');

/**
 * Creates a throwaway, git-initialized fixture repo under the OS temp
 * directory: just the Python scripts records.js needs, an empty
 * research/raw/ folder ready for new_research_session.py to write into, and
 * an empty research/findings/ folder (findings/tags.md is optional — an
 * empty glossary is valid, per load_tag_glossary()). Returns the fixture's
 * absolute path.
 *
 * corpusDir, if given, is copied into the repo root before the initial commit
 * (E2E uses a fixed corpus; Jest tests start empty).
 */
function createTestRepo({ corpusDir } = {}) {
    if (!fs.existsSync(REAL_SCRIPTS_DIR)) {
        throw new Error(
            `No agentic-repo scripts at ${REAL_SCRIPTS_DIR}. Set REAL_AGENTIC_REPO_ROOT to an `
            + 'agentic-repo checkout (only read from; scripts are copied out of it).',
        );
    }

    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-repo-test-'));

    const scriptsDir = path.join(repoRoot, 'research', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'research', 'raw'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'research', 'findings'), { recursive: true });

    // A minimal, valid tag glossary — otherwise every tag any test uses gets
    // flagged as "not in glossary" by build_index.py's validate_tags(), which
    // is correct behavior on its part, just noise for our purposes here.
    fs.writeFileSync(
        path.join(repoRoot, 'research', 'findings', 'tags.md'),
        '# Tags\n\n- **`onboarding`**\n- **`usability`**\n',
    );

    for (const file of SCRIPT_FILES) {
        fs.copyFileSync(path.join(REAL_SCRIPTS_DIR, file), path.join(scriptsDir, file));
    }

    if (corpusDir) {
        fs.cpSync(corpusDir, repoRoot, { recursive: true });
    }

    execFileSync('git', ['init'], { cwd: repoRoot });
    fs.writeFileSync(path.join(repoRoot, THROWAWAY_MARKER), 'Throwaway test repo created by setupTestRepo.js\n');
    // A fresh temp dir isn't guaranteed to inherit a usable git identity from
    // global config in every environment — set one locally so `git commit`
    // never fails on "please tell me who you are", independent of whatever
    // this machine's global git config looks like.
    execFileSync('git', ['config', 'user.name', 'Test Fixture'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.email', 'test-fixture@example.com'], { cwd: repoRoot });

    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '__pycache__/\n');
    execFileSync('git', ['add', '-A'], { cwd: repoRoot });
    execFileSync('git', ['commit', '-m', 'Initial fixture commit'], { cwd: repoRoot });

    return repoRoot;
}

/** Deletes the fixture repo entirely. */
async function destroyTestRepo(repoRoot) {
    // maxRetries/retryDelay handle a known class of transient ENOTEMPTY/EBUSY
    // errors when recursively deleting a .git folder on macOS — a brief race
    // with the filesystem (Spotlight, fsevents, or git's own short-lived lock
    // files) can make a single deletion pass fail even though the directory
    // is genuinely safe to remove a moment later.
    await fsp.rm(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

module.exports = { createTestRepo, destroyTestRepo, THROWAWAY_MARKER };