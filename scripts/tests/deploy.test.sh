#!/usr/bin/env bash
#
# Exercises scripts/deploy.sh end to end without the server: a throwaway
# origin with release tags, a checkout of it, stand-ins for npm and scl, a
# tiny app with /api/health, and a loop that restarts it like the Node.js
# Selector does (optionally giving up after repeated crashes, like the
# Selector's crash-loop protection).
#
#   scripts/tests/deploy.test.sh
#
# Needs bash 4.4+, git, node, curl, flock and perl. On Linux the script under
# test reads /proc; elsewhere (macOS) it falls back to ps, so the /proc paths
# are only covered on Linux (CI). That includes the phase that simulates a
# host refusing to read /proc/<pid>/exe, by stubbing readlink on PATH.
#
# The fake app runs node through a symlink named MainThread, so its process
# name (comm) is never "node" on any OS. That's what Node 24 on Linux does to
# every node process (it renames its main thread), and the reason deploy.sh
# must never look processes up by name. process.title would change the name
# too, but on Linux it also overwrites the arguments, which would hide the
# launcher path; the real app never does that.

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
T=$(mktemp -d "${TMPDIR:-/tmp}/deploy-test.XXXXXX")
T=$(cd "$T" && pwd -P)
ORIGIN=$T/origin.git
SRC=$T/src
APP=$T/home/apps/research-repo-crud-ui
LAUNCHER=$T/home/www/server.js
BIN=$T/bin
APP_EXE=$BIN/MainThread
# argv[0] the fake Selector starts the app with; see start_selector.
APP_ARGV0=$APP_EXE
# readlink and ps stand-ins for the unreadable-/proc/<pid>/exe phase.
NOEXE_BIN=$T/noexe-bin
READLINK_LOG=$T/readlink.log
PS_LOG=$T/ps.log
PORT=$((20000 + RANDOM % 20000))
NPM_LOG=$T/npm.log
OUT=$T/last.out
SELECTOR_PID=""
DECOY_PIDS=()
PASSED=0
FAILED=0

cleanup() {
    stop_selector
    local pid
    for pid in "${DECOY_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    rm -rf "$T"
}
trap cleanup EXIT

check() {
    local desc=$1
    shift
    if "$@"; then
        PASSED=$((PASSED + 1))
        echo "  ok    $desc"
    else
        FAILED=$((FAILED + 1))
        echo "  FAIL  $desc"
        echo "        --- last deploy output (tail) ---"
        tail -n 25 "$OUT" 2>/dev/null | sed 's/^/        /'
    fi
}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

setup_stubs() {
    mkdir -p "$BIN"
    ln -s "$(command -v node)" "$BIN/node"
    ln -s "$(command -v node)" "$APP_EXE"

    cat >"$BIN/npm" <<'EOF'
#!/usr/bin/env bash
# Stand-in for npm: logs each call, fakes ci / run build / run build-release,
# and fails any step listed in FAKE_NPM_FAIL (ci, run:build, run:build-release).
echo "npm $*" >>"$FAKE_NPM_LOG"
cmd=$1; shift
script=""
if [[ $cmd == run ]]; then script=$1; shift; fi
prefix=.; outdir=""
while (($#)); do
    case $1 in
        --prefix) prefix=$2; shift ;;
        --outDir) outdir=$2; shift ;;
    esac
    shift
done
step=$cmd${script:+:$script}
if [[ ",${FAKE_NPM_FAIL:-}," == *",$step,"* ]]; then
    echo "fake npm: $step failed on purpose" >&2
    exit 1
fi
name=$(node -p "require('$prefix/package.json').name")
case $step in
    ci)
        rm -rf "$prefix/node_modules"
        mkdir -p "$prefix/node_modules"
        if [[ $name == backend ]]; then
            mkdir -p "$prefix/node_modules/better-sqlite3/prebuilds" "$prefix/node_modules/bcrypt"
            touch "$prefix/node_modules/better-sqlite3/prebuilds/linux-x64.node"
            echo '{"name":"better-sqlite3","main":"index.js"}' >"$prefix/node_modules/better-sqlite3/package.json"
            echo 'module.exports = () => ({ close() {} });' >"$prefix/node_modules/better-sqlite3/index.js"
            echo 'module.exports = {};' >"$prefix/node_modules/bcrypt/index.js"
        fi
        ;;
    run:build)
        mkdir -p "$prefix/$outdir"
        echo "<p>$(node -p "require('$prefix/package.json').version")</p>" >"$prefix/$outdir/index.html"
        ;;
    run:build-release)
        if [[ -e $prefix/prebuilds ]]; then
            echo "fake npm: prebuilds still present, the build would be ignored" >&2
            exit 1
        fi
        mkdir -p "$prefix/build/Release"
        touch "$prefix/build/Release/better_sqlite3.node"
        ;;
esac
EOF

    cat >"$BIN/scl" <<'EOF'
#!/usr/bin/env bash
# Stand-in for scl: logs, then runs whatever follows "--".
echo "scl $*" >>"$FAKE_NPM_LOG"
while (($#)) && [[ $1 != -- ]]; do shift; done
shift
exec "$@"
EOF
    chmod +x "$BIN/npm" "$BIN/scl"
}

# Stand-ins, put first on PATH, for a host that refuses to read
# /proc/<pid>/exe even for the user's own processes: GNU readlink -f then
# prints nothing and exits 1. Every other readlink goes to the real one. ps
# is only logged, to prove deploy.sh never falls back to it on Linux.
setup_noexe_stubs() {
    mkdir -p "$NOEXE_BIN"
    : >"$READLINK_LOG"
    : >"$PS_LOG"
    {
        printf '#!/usr/bin/env bash\nreal=%q\nlog=%q\n' "$(command -v readlink)" "$READLINK_LOG"
        cat <<'EOF'
for arg; do
    if [[ $arg =~ ^/proc/[0-9]+/exe$ ]]; then
        echo "readlink $*" >>"$log"
        exit 1
    fi
done
exec "$real" "$@"
EOF
    } >"$NOEXE_BIN/readlink"
    {
        printf '#!/usr/bin/env bash\nreal=%q\nlog=%q\n' "$(command -v ps)" "$PS_LOG"
        cat <<'EOF'
echo "ps $*" >>"$log"
exec "$real" "$@"
EOF
    } >"$NOEXE_BIN/ps"
    chmod +x "$NOEXE_BIN/readlink" "$NOEXE_BIN/ps"
}

# One release: version $1, backend dependency marker $2 (a different marker
# means a different lockfile), and $3 = broken (crashes at startup),
# mismatch (package.json disagrees with the tag), nohealth, or empty.
make_release() {
    local version=$1 deps=$2 kind=${3:-} pkg_version=$1
    if [[ $kind == mismatch ]]; then
        pkg_version=0.0.0
    fi
    mkdir -p "$SRC/backend/routes" "$SRC/frontend" "$SRC/scripts"
    cp "$ROOT/scripts/deploy.sh" "$SRC/scripts/deploy.sh"
    printf 'node_modules/\nnode_modules.prev/\ndist/\ndist.next/\ndist.prev/\n' >"$SRC/.gitignore"
    echo "{\"name\":\"backend\",\"version\":\"$pkg_version\"}" >"$SRC/backend/package.json"
    echo "{\"name\":\"backend\",\"version\":\"$pkg_version\",\"lockfileVersion\":3,\"packages\":{\"\":{\"name\":\"backend\",\"version\":\"$pkg_version\"},\"node_modules/fake-dep\":{\"version\":\"$deps\"}}}" >"$SRC/backend/package-lock.json"
    echo "{\"name\":\"frontend\",\"version\":\"$version\"}" >"$SRC/frontend/package.json"
    echo "{\"name\":\"frontend\",\"version\":\"$version\",\"lockfileVersion\":3}" >"$SRC/frontend/package-lock.json"
    if [[ $kind == nohealth ]]; then
        rm -f "$SRC/backend/routes/health.js"
    else
        echo '// placeholder: deploy.sh only checks this file exists' >"$SRC/backend/routes/health.js"
    fi
    if [[ $kind == broken ]]; then
        echo "throw new Error('broken release');" >"$SRC/backend/server.js"
    else
        cat >"$SRC/backend/server.js" <<'EOF'
const http = require('http');
const { version } = require('./package.json');
const startedAt = new Date().toISOString();
http.createServer((req, res) => {
    if (req.url.startsWith('/api/health')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        return res.end(JSON.stringify({ status: 'ok', version, startedAt }));
    }
    res.statusCode = 404;
    res.end();
}).listen(Number(process.env.PORT), '127.0.0.1');
process.on('SIGTERM', () => process.exit(0));
EOF
    fi
    git -C "$SRC" add -A
    git -C "$SRC" commit -qm "release $version"
    git -C "$SRC" tag "v$version"
}

setup_repos() {
    export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
    export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
    git init -q "$SRC"
    make_release 0.0.1 A
    make_release 0.0.2 A
    make_release 0.0.3 A           # version bump only: backend install skipped
    make_release 0.0.4 B           # new backend dependencies
    make_release 0.0.5 C broken    # crashes at startup
    make_release 0.0.6 B           # good; used with injected build failures
    make_release 0.0.7 B mismatch
    make_release 0.0.8 B nohealth
    make_release 0.0.9 D           # good; needs a backend install
    git clone -q --bare "$SRC" "$ORIGIN"
    git clone -q "$ORIGIN" "$APP"
    git -C "$APP" -c advice.detachedHead=false checkout -q v0.0.1

    # What a live v0.0.1 has: installed backend (no fingerprint yet, as after
    # the manual first deploy) and a built frontend.
    mkdir -p "$APP/backend/node_modules" "$APP/frontend/dist"
    echo '<p>0.0.1</p>' >"$APP/frontend/dist/index.html"

    mkdir -p "$(dirname "$LAUNCHER")"
    echo "require('$APP/backend/server.js');" >"$LAUNCHER"
}

# The fake Node.js Selector: runs the launcher, restarts it a second after it
# exits. With $1 = n, gives up after n crashes in a row. $2 is the argv[0] to
# start the app with (default: the MainThread path it really runs). On Linux
# that changes the arguments but not comm; on macOS it changes comm too, so
# only the Linux-only phase passes one.
start_selector() {
    local give_up=${1:-0}
    APP_ARGV0=${2:-$APP_EXE}
    PORT=$PORT LAUNCHER=$LAUNCHER APP_EXE=$APP_EXE APP_ARGV0=$APP_ARGV0 PATH=$BIN:$PATH bash -c '
        crashes=0
        while :; do
            (exec -a "$APP_ARGV0" "$APP_EXE" "$LAUNCHER" 2>/dev/null)
            if (($? != 0)); then crashes=$((crashes + 1)); else crashes=0; fi
            if (('"$give_up"' > 0 && crashes >= '"$give_up"')); then exit 0; fi
            sleep 1
        done
    ' &
    SELECTOR_PID=$!
}

stop_selector() {
    if [[ -n $SELECTOR_PID ]]; then
        kill "$SELECTOR_PID" 2>/dev/null || true
        wait "$SELECTOR_PID" 2>/dev/null || true
        SELECTOR_PID=""
    fi
    pkill -f -x -- "$(re_escape "$APP_ARGV0 $LAUNCHER")" 2>/dev/null || true
}

start_decoy() {
    node -e 'setInterval(() => {}, 1000)' "$@" &
    DECOY_PIDS+=($!)
}

# Not node, but with the launcher path as an argument.
start_non_node_decoy() {
    perl -e 'sleep 120' "$LAUNCHER" &
    DECOY_PIDS+=($!)
}

re_escape() {
    # Escapes regex metacharacters; one bracket class reads better than a
    # ${var//} per character.
    # shellcheck disable=SC2001
    sed 's/[][\.*^$+?(){}|]/\\&/g' <<<"$1"
}

# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

health_version() {
    curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null |
        node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(JSON.parse(s).version)}catch{}})'
}

wait_for_version() {
    for _ in $(seq 1 40); do
        [[ $(health_version) == "$1" ]] && return 0
        sleep 0.5
    done
    return 1
}

app_pid() {
    pgrep -f -x -- "$(re_escape "$APP_ARGV0 $LAUNCHER")" | head -n 1
}

# The app process's name as the OS reports it (never "node" here).
app_comm() {
    local comm
    comm=$(ps -p "$(app_pid)" -o comm=)
    echo "${comm##*/}"
}

live_tag() {
    git -C "$APP" describe --tags --exact-match 2>/dev/null
}

fingerprint_now() {
    cat "$APP/backend/node_modules/.deploy-fingerprint" 2>/dev/null
}

# Runs the checkout's own deploy.sh, the way the server will. Sets RC.
# NODE_BIN="" passes DEPLOY_NODE_BIN empty, so the script finds the app's
# node itself; STUB_PATH is put first on PATH.
deploy() {
    : >"$NPM_LOG"
    env HOME="$T/home" TMPDIR="$T/tmp" PATH="${STUB_PATH:+$STUB_PATH:}$PATH" \
        DEPLOY_APP_DIR="$APP" DEPLOY_LAUNCHER="$LAUNCHER" DEPLOY_PORT="$PORT" \
        DEPLOY_HEALTH_URL="" DEPLOY_STATE_DIR="$T/state" DEPLOY_LOG_FILE="$T/logs/deploy.log" \
        DEPLOY_NODE_BIN="${NODE_BIN-$BIN}" \
        DEPLOY_HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-15}" DEPLOY_POLL_INTERVAL=1 \
        FAKE_NPM_LOG="$NPM_LOG" FAKE_NPM_FAIL="${FAKE_NPM_FAIL:-}" \
        "$BASH" "$APP/scripts/deploy.sh" "$@" >"$OUT" 2>&1
    RC=$?
}

out_has() { grep -Fq -- "$1" "$OUT"; }
npm_log_has() { grep -Fq -- "$1" "$NPM_LOG"; }
count_in_out() { grep -Fc -- "$1" "$OUT"; }

# A refusal: exit 3 AND its own reason, so no refusal test can pass because
# of an unrelated refusal (as they all once did, for "No app process found").
expect_refusal() {
    local desc=$1 reason=$2
    shift 2
    deploy "$@"
    check "$desc" test "$RC" -eq 3
    check "  ...because: $reason" out_has "$reason"
}

# ---------------------------------------------------------------------------

main() {
    if ((BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 4))); then
        echo "needs bash 4.4+ (this is $BASH_VERSION)" >&2
        exit 1
    fi
    local missing=0 tool
    for tool in git node curl flock pgrep perl; do
        command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; missing=1; }
    done
    ((missing == 0)) || exit 1

    echo "Deploy harness in $T (port $PORT)"
    mkdir -p "$T/tmp"
    setup_stubs
    setup_repos
    start_selector
    if ! wait_for_version 0.0.1; then
        echo "fake app never came up" >&2
        exit 1
    fi

    local pid0 pid1 pid2 fp

    echo "Sanity: the script finds the app"
    pid0=$(app_pid)
    check "the fake app's process name is $(app_comm), not node" test "$(app_comm)" != node
    check "  ...so pgrep -x node can't see it" bash -c "! pgrep -x node | grep -qx '$pid0'"
    deploy --dry-run v0.0.2
    if ((RC != 0)) || ! out_has "restart process $pid0"; then
        echo "  FAIL  a dry run of a valid tag must succeed and find process $pid0 (exit $RC):"
        sed 's/^/        /' "$OUT"
        echo "Stopping: every later result would be meaningless."
        exit 1
    fi
    check "a dry run of a valid tag finds process $pid0" true

    echo "Preflight refusals (exit 3 with their own reason, nothing changed)"
    expect_refusal "a malformed tag is refused" "is not vMAJOR.MINOR.PATCH" v1.2
    expect_refusal "a tag with shell junk is refused" "is not vMAJOR.MINOR.PATCH" 'v0.0.2;touch pwned'
    check "  ...and nothing ran" test ! -e "$APP/pwned"
    expect_refusal "a tag that doesn't exist is refused" "Tag v9.9.9 does not exist on origin" v9.9.9
    expect_refusal "a tag whose package.json versions disagree is refused" "don't match the tag" v0.0.7
    expect_refusal "a tag without /api/health is refused" "has no /api/health" v0.0.8
    expect_refusal "an unknown option is refused" "Unknown option: --bogus" --bogus v0.0.2

    echo 'x' >>"$APP/backend/server.js"
    expect_refusal "uncommitted changes are refused" "has uncommitted changes" v0.0.2
    git -C "$APP" checkout -q -- backend/server.js

    flock "$T/state/deploy.lock" sleep 30 &
    local holder=$!
    sleep 0.5
    expect_refusal "a held lock is refused" "Another deploy is running" v0.0.2
    # The sleep holds the lock, not flock itself.
    kill $(pgrep -P "$holder") "$holder" 2>/dev/null; wait "$holder" 2>/dev/null

    start_decoy "$LAUNCHER"
    expect_refusal "two app processes are refused" "More than one app process found" v0.0.2
    kill "${DECOY_PIDS[-1]}"; wait "${DECOY_PIDS[-1]}" 2>/dev/null
    unset 'DECOY_PIDS[-1]'

    stop_selector
    expect_refusal "no app process is refused" "No app process found" v0.0.2
    start_selector
    wait_for_version 0.0.1
    pid0=$(app_pid)

    check "  ...still on v0.0.1 after all refusals" test "$(live_tag)" = v0.0.1
    check "  ...app never restarted" test "$(app_pid)" = "$pid0"

    echo "Dry run"
    deploy --dry-run v0.0.2
    check "--dry-run exits 0" test "$RC" -eq 0
    check "  ...plans a backend install (no fingerprint yet)" out_has "backend reinstall: yes"
    check "  ...changes nothing" test "$(live_tag)" = v0.0.1
    check "  ...restarts nothing" test "$(app_pid)" = "$pid0"
    check "  ...runs no npm" test ! -s "$NPM_LOG"

    echo "Deploy v0.0.1 -> v0.0.2 (first scripted deploy, backend installed)"
    start_decoy "$LAUNCHER.bak"
    start_decoy "$APP/backend/server.js"
    start_non_node_decoy
    deploy v0.0.2
    check "exits 0" test "$RC" -eq 0
    check "  ...checked out v0.0.2" test "$(live_tag)" = v0.0.2
    check "  ...new process serves 0.0.2" test "$(health_version)" = 0.0.2
    pid1=$(app_pid)
    check "  ...with a new PID" test "$pid1" != "$pid0"
    check "  ...near-miss processes were left alone (node with similar args, non-node with the launcher arg)" kill -0 "${DECOY_PIDS[0]}" "${DECOY_PIDS[1]}" "${DECOY_PIDS[2]}"
    check "  ...and the new process isn't named node either" test "$(app_comm)" != node
    check "  ...backend installed in staging, --omit=dev" npm_log_has "npm ci --prefix $T/state/backend-staging --omit=dev"
    check "  ...better-sqlite3 compiled under scl" npm_log_has "scl enable gcc-toolset-14 -- npm run build-release"
    check "  ...fingerprint written" test -s "$APP/backend/node_modules/.deploy-fingerprint"
    check "  ...previous node_modules kept" test -d "$APP/backend/node_modules.prev"
    check "  ...dist is the new build" grep -q 0.0.2 "$APP/frontend/dist/index.html"
    check "  ...previous dist kept as dist.prev" grep -q 0.0.1 "$APP/frontend/dist.prev/index.html"
    check "  ...no dist.next left" test ! -e "$APP/frontend/dist.next"
    check "  ...log lines are timestamped" grep -Eq '^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z\] === Deployed v0.0.2' "$T/logs/deploy.log"
    check "  ...one SIGTERM" test "$(count_in_out 'Sending SIGTERM')" -eq 1

    echo "Deploying the tag that's already live"
    deploy v0.0.2
    check "exits 0 without doing anything" test "$RC" -eq 0
    check "  ...says so" out_has "already checked out"
    check "  ...no restart" test "$(app_pid)" = "$pid1"

    echo "Deploy v0.0.3 (version bump only)"
    fp=$(fingerprint_now)
    deploy v0.0.3
    check "exits 0" test "$RC" -eq 0
    check "  ...serves 0.0.3" test "$(health_version)" = 0.0.3
    check "  ...skipped the backend install" bash -c "! grep -q 'backend-staging' '$NPM_LOG'"
    check "  ...fingerprint unchanged" test "$(fingerprint_now)" = "$fp"
    check "  ...frontend still rebuilt" npm_log_has "npm run build --prefix $APP/frontend -- --outDir dist.next --emptyOutDir"

    echo "Deploy v0.0.4 (new backend dependencies)"
    deploy v0.0.4
    check "exits 0" test "$RC" -eq 0
    check "  ...serves 0.0.4" test "$(health_version)" = 0.0.4
    check "  ...reinstalled the backend" npm_log_has "backend-staging"
    check "  ...fingerprint changed" test "$(fingerprint_now)" != "$fp"

    echo "Frontend build fails (v0.0.6)"
    pid1=$(app_pid)
    fp=$(fingerprint_now)
    FAKE_NPM_FAIL=run:build deploy v0.0.6
    check "exits 1" test "$RC" -eq 1
    check "  ...back on v0.0.4" test "$(live_tag)" = v0.0.4
    check "  ...no restart (the app was never touched)" test "$(app_pid)" = "$pid1"
    check "  ...still serving 0.0.4" test "$(health_version)" = 0.0.4
    check "  ...live dist untouched" grep -q 0.0.4 "$APP/frontend/dist/index.html"
    check "  ...no SIGTERM at all" test "$(count_in_out 'Sending SIGTERM')" -eq 0

    echo "better-sqlite3 compile fails (v0.0.9)"
    FAKE_NPM_FAIL=run:build-release deploy v0.0.9
    check "exits 1" test "$RC" -eq 1
    check "  ...back on v0.0.4" test "$(live_tag)" = v0.0.4
    check "  ...no restart" test "$(app_pid)" = "$pid1"
    check "  ...live node_modules untouched" test "$(fingerprint_now)" = "$fp"

    echo "Release crashes at startup (v0.0.5): rollback with one restart"
    deploy v0.0.5
    check "exits 1" test "$RC" -eq 1
    check "  ...back on v0.0.4" test "$(live_tag)" = v0.0.4
    wait_for_version 0.0.4
    check "  ...serving 0.0.4 again" test "$(health_version)" = 0.0.4
    pid2=$(app_pid)
    check "  ...from a fresh process" test "$pid2" != "$pid1"
    check "  ...previous node_modules restored" test "$(fingerprint_now)" = "$fp"
    check "  ...previous dist restored" grep -q 0.0.4 "$APP/frontend/dist/index.html"
    # Deploy's SIGTERM, plus at most one from the rollback: the crashing
    # release is often between restarts when rollback looks, and then there's
    # nothing to signal.
    check "  ...at most two SIGTERMs (deploy + one rollback restart)" test "$(count_in_out 'Sending SIGTERM')" -le 2
    check "  ...says it rolled back" out_has "Rolled back: v0.0.4 is live"

    echo "Release crashes and the Selector gives up: exit 2, no loop"
    stop_selector
    start_selector 2
    wait_for_version 0.0.4
    HEALTH_TIMEOUT=8 deploy v0.0.5
    check "exits 2" test "$RC" -eq 2
    check "  ...tells you to press Restart in the Selector" out_has "press Restart for this app in the Node.js Selector"
    check "  ...old release checked out and ready" test "$(live_tag)" = v0.0.4
    check "  ...one SIGTERM (nothing left to signal on rollback)" test "$(count_in_out 'Sending SIGTERM')" -eq 1
    stop_selector
    start_selector
    wait_for_version 0.0.4
    check "  ...and a manual Restart brings v0.0.4 back" test "$(health_version)" = 0.0.4

    echo "Host that refuses to read /proc/<pid>/exe (argv[0] stands in)"
    local exe_lines
    # The readlink stub only models the host if the link is read nowhere
    # else, and by nothing but that one readlink (no [[ -e ]], realpath...).
    exe_lines=$(grep -v '^[[:space:]]*#' "$ROOT/scripts/deploy.sh" | grep -c '/proc/[^ ]*/exe')
    check "deploy.sh reads /proc/<pid>/exe in exactly one place" test "$exe_lines" -eq 1
    # shellcheck disable=SC2016 # the $1 is deploy.sh's, matched literally
    check "  ...with a plain readlink -f, which the stub stands in for" grep -Fq 'readlink -f "/proc/$1/exe"' "$ROOT/scripts/deploy.sh"
    if [[ ! -r /proc/$$/cmdline ]]; then
        echo "  SKIP  the rest needs Linux /proc; without it deploy.sh uses ps and never reads /proc"
    else
        setup_noexe_stubs
        stop_selector
        # The host's shape: comm MainThread, argv[0] an absolute path to node.
        start_selector 0 "$BIN/node"
        wait_for_version 0.0.4
        pid0=$(app_pid)
        check "the app runs with argv[0] $BIN/node" test -n "$pid0"
        check "  ...and its process name is still $(app_comm), not node" test "$(app_comm)" != node
        # Both have the launcher as an argument and really are node, but
        # their argv[0] can't vouch for that: relative, and not named node.
        start_decoy "$LAUNCHER"
        (exec -a "$APP_EXE" node -e 'setInterval(() => {}, 1000)' "$LAUNCHER") &
        DECOY_PIDS+=($!)

        STUB_PATH=$NOEXE_BIN NODE_BIN="" deploy --dry-run v0.0.6
        check "a dry run exits 0" test "$RC" -eq 0
        check "  ...finds the app process $pid0" out_has "restart process $pid0"
        check "  ...because it really couldn't read the exe link" test -s "$READLINK_LOG"
        check "  ...takes the app's node from argv[0]" out_has "App's node: $BIN/node (from the argv[0] of process $pid0; its exe link can't be read)"
        check "  ...and deploys with it" grep -q "Using node v.* at $BIN/node\$" "$OUT"
        check "  ...never ran ps" test ! -s "$PS_LOG"

        : >"$READLINK_LOG"
        STUB_PATH=$NOEXE_BIN NODE_BIN="" deploy v0.0.6
        check "a deploy exits 0" test "$RC" -eq 0
        check "  ...serves 0.0.6" test "$(health_version)" = 0.0.6
        check "  ...with a new PID" test "$(app_pid)" != "$pid0"
        check "  ...one SIGTERM" test "$(count_in_out 'Sending SIGTERM')" -eq 1
        check "  ...couldn't read the exe link" test -s "$READLINK_LOG"
        check "  ...never ran ps" test ! -s "$PS_LOG"
        check "  ...left the decoys alone (relative argv[0]; argv[0] not named node)" kill -0 "${DECOY_PIDS[-2]}" "${DECOY_PIDS[-1]}"
    fi

    echo "Housekeeping"
    check "no temp copies of deploy.sh left behind" test -z "$(ls -A "$T/tmp")"
    check "--help exits 0" bash -c "'$BASH' '$APP/scripts/deploy.sh' --help >/dev/null"

    echo
    echo "$PASSED passed, $FAILED failed"
    ((FAILED == 0))
}

main "$@"
