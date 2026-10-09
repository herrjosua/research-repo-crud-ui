#!/usr/bin/env bash
#
# Runs the full backend Jest suite repeatedly and says exactly what failed,
# so a flaky test (RR-131) can be caught with its real error message instead
# of being lost to the next green run. Run from anywhere:
#
#   backend/scripts/flake-hunt.sh [runs]        default 50 runs
#
# Environment (all optional):
#   LOAD=n         start n busy-loop processes for the duration (default 0).
#                  Try the machine's core count, or run Ollama / the eval
#                  harness alongside, which is when the flake was first seen.
#   WORKERS=n      pass --maxWorkers=n to Jest (default: Jest's own choice).
#   FRESH_CACHE=1  pass --no-cache, so every run looks like the first runs
#                  after a checkout (cold transform cache, different suite
#                  order). The flake was seen in the first runs only.
#   JEST_EXTRA="a b"  extra arguments for Jest, e.g. a few test files to run
#                  together: JEST_EXTRA="tests/devTools.test.js tests/production.test.js"
#   KEEP_GOING=0   stop at the first failing run (default: run them all).
#   OUT_DIR=path   where the per-run JSON and logs go (default: a new temp dir).
#
# Prints one line per run, then a summary that groups failures by suite and
# test with the first lines of the error. Exit 0 only if every run passed.
# Needs the same setup as `npm test` (REAL_AGENTIC_REPO_ROOT, PYTHON_BIN).

set -u
RUNS="${1:-50}"
LOAD="${LOAD:-0}"
KEEP_GOING="${KEEP_GOING:-1}"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/flake-hunt.XXXXXX")}"
mkdir -p "$OUT_DIR"

JEST_ARGS=(--json)
[ -n "${WORKERS:-}" ] && JEST_ARGS+=("--maxWorkers=$WORKERS")
[ "${FRESH_CACHE:-0}" = "1" ] && JEST_ARGS+=(--no-cache)
# Deliberately unquoted: JEST_EXTRA is a space-separated list of arguments.
# shellcheck disable=SC2206
[ -n "${JEST_EXTRA:-}" ] && JEST_ARGS+=($JEST_EXTRA)

HOGS=()
cleanup() { for p in ${HOGS[@]+"${HOGS[@]}"}; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT INT TERM
i=0
while [ "$i" -lt "$LOAD" ]; do
    ( while :; do :; done ) &
    HOGS+=($!)
    i=$((i + 1))
done

echo "flake-hunt: $RUNS runs, LOAD=$LOAD, ${WORKERS:+WORKERS=$WORKERS, }${FRESH_CACHE:+FRESH_CACHE=$FRESH_CACHE, }output in $OUT_DIR"
cd "$BACKEND_DIR" || exit 1

failed_runs=0
for n in $(seq 1 "$RUNS"); do
    # Fresh per-worker databases each run, so a leftover from the last run
    # can't hide (or cause) a failure.
    rm -f app.test.*.db app.test.*.db-shm app.test.*.db-wal
    start=$(date +%s)
    npx jest "${JEST_ARGS[@]}" --outputFile="$OUT_DIR/run-$n.json" > "$OUT_DIR/run-$n.log" 2>&1
    code=$?
    echo "$code" > "$OUT_DIR/run-$n.exit"
    secs=$(( $(date +%s) - start ))
    if [ "$code" -eq 0 ]; then
        echo "run $n: pass (${secs}s)"
    else
        failed_runs=$((failed_runs + 1))
        echo "run $n: FAIL exit=$code (${secs}s)  log: $OUT_DIR/run-$n.log"
        [ "$KEEP_GOING" = "0" ] && break
    fi
done

echo
echo "flake-hunt: $failed_runs of $n runs failed"
if [ "$failed_runs" -gt 0 ]; then
    node - "$OUT_DIR" <<'JS'
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const byTest = new Map();
// A run where Node itself died (abort, segfault) before Jest wrote its report
// has an exit code but no JSON, so it would otherwise vanish from this list.
const noReport = [];
for (const f of fs.readdirSync(dir).filter((x) => /^run-\d+\.exit$/.test(x))) {
    const n = f.match(/\d+/)[0];
    const code = fs.readFileSync(path.join(dir, f), 'utf8').trim();
    if (code !== '0' && !fs.existsSync(path.join(dir, `run-${n}.json`))) noReport.push(`run ${n} (exit ${code})`);
}
if (noReport.length) {
    console.log(`\n${noReport.length}x  Jest died without writing a report: ${noReport.join(', ')}`);
    console.log('    exit 134 = abort, 139 = segmentation fault; see that run\'s .log for anything it printed');
}
for (const f of fs.readdirSync(dir).filter((x) => /^run-\d+\.json$/.test(x))) {
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    for (const suite of r.testResults) {
        const rel = path.relative(process.cwd(), suite.name);
        // A suite that fails before any test runs (a throwing beforeAll, a
        // module that won't load) has no failed assertions, only a message.
        if (suite.status === 'failed' && !suite.assertionResults.some((a) => a.status === 'failed')) {
            const key = `${rel} :: (suite failed to run)`;
            (byTest.get(key) || byTest.set(key, []).get(key)).push({ run: f, msg: suite.message });
        }
        for (const a of suite.assertionResults.filter((x) => x.status === 'failed')) {
            const key = `${rel} :: ${a.fullName}`;
            (byTest.get(key) || byTest.set(key, []).get(key)).push({ run: f, msg: (a.failureMessages || []).join('\n') });
        }
    }
}
for (const [key, hits] of [...byTest].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${hits.length}x  ${key}`);
    console.log(`    first seen in ${hits[0].run}`);
    // eslint-disable-next-line no-control-regex
    const clean = hits[0].msg.replace(/\u001b\[[0-9;]*m/g, '');
    console.log(clean.split('\n').slice(0, 8).map((l) => '    ' + l).join('\n'));
}
JS
fi
[ "$failed_runs" -eq 0 ]
