const fs = require('fs');
const path = require('path');

// Marks an agentic-repo checkout as a throwaway made by
// tests/helpers/setupTestRepo.js. Kept inside .git/ so it never shows up in
// git status or a commit, and nothing else ever creates it, so its presence
// proves a repo is safe for tests to write to and delete from.
const THROWAWAY_MARKER = path.join('.git', 'crud-ui-throwaway');

function isThrowawayRepo(repoRoot) {
  return fs.existsSync(path.join(repoRoot, THROWAWAY_MARKER));
}

module.exports = { THROWAWAY_MARKER, isThrowawayRepo };
