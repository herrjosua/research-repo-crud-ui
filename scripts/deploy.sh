#!/usr/bin/env bash
#
# One-command deploy for the webhost. Runs ON THE SERVER, from the app
# checkout, never locally:
#
#   scripts/deploy.sh [--dry-run] <tag>        e.g. scripts/deploy.sh v1.2.8
#
# Checks out a release tag, installs and builds it, restarts the app through
# the Node.js Selector (SIGTERM; the Selector starts a fresh process), and
# waits for /api/health to report the new version. Any failure after the
# checkout rolls back to the tag that was live, restarting at most once.
#
# Exit codes:
#   0  deployed (or --dry-run / already on that tag)
#   1  deploy failed and was rolled back; the previous release is live
#   2  rollback failed, or the app didn't come back: needs a human
#   3  refused before changing anything (bad tag, dirty checkout, lock held...)
#
# Every default below can be overridden through the environment, which is how
# scripts/tests/deploy.test.sh runs this against a throwaway checkout.
# docs/deploy.md is the runbook.

set -Eeuo pipefail

APP_DIR=${DEPLOY_APP_DIR:-$HOME/apps/research-repo-crud-ui}
LAUNCHER=${DEPLOY_LAUNCHER:-$HOME/www/ux-research.joshuabock.com/server.js}
PORT=${DEPLOY_PORT:-26851}
HOST_HEADER=${DEPLOY_HOST:-ux-research.joshuabock.com}
# Checked after the local one; set it empty to skip (tests do).
PUBLIC_HEALTH_URL=${DEPLOY_HEALTH_URL-https://ux-research.joshuabock.com/api/health}
STATE_DIR=${DEPLOY_STATE_DIR:-$HOME/apps/.research-repo-crud-ui-deploy}
LOG_FILE=${DEPLOY_LOG_FILE:-$HOME/logs/deploy/research-repo-crud-ui.log}
LOCK_FILE=${DEPLOY_LOCK_FILE:-$STATE_DIR/deploy.lock}
# Directory holding the node and npm to use. Empty means the one the running
# app uses (/proc/<pid>/exe), falling back to nvm, then PATH.
NODE_BIN=${DEPLOY_NODE_BIN:-}
NVM_SH=${DEPLOY_NVM_SH-$HOME/.nvm/nvm.sh}
NODE_VERSION=${DEPLOY_NODE_VERSION:-24}
# Prefix for the better-sqlite3 compile: the system gcc is too old for its
# C++20 source. Split on spaces; empty means no prefix.
read -r -a SCL <<<"${DEPLOY_SCL-scl enable gcc-toolset-14 --}"
HEALTH_TIMEOUT=${DEPLOY_HEALTH_TIMEOUT:-120}
POLL_INTERVAL=${DEPLOY_POLL_INTERVAL:-3}
STEP_TIMEOUT=${DEPLOY_STEP_TIMEOUT:-1200}

BACKEND=$APP_DIR/backend
FRONTEND=$APP_DIR/frontend
# Where the backend's dependencies are installed and compiled before being
# moved into place, so the running process keeps its node_modules until the
# restart. Must be on the same filesystem as APP_DIR for the move to be a
# rename.
STAGING=$STATE_DIR/backend-staging
FINGERPRINT_FILE=.deploy-fingerprint

PHASE=preflight   # preflight -> deploy -> finished; rollback runs from on_exit
DRY_RUN=0
TAG=""
TARGET_VERSION=""
OLD_SHA=""
OLD_DESC=""
OLD_VERSION=""
APP_PID=""
NEED_BACKEND=0
CHECKED_OUT=0
BACKEND_SWAPPED=0
FRONTEND_SWAPPED=0
RESTARTED=0
HEALTH_SAW_PROCESS=0
LAST_HEALTH=""
FAILED_AT=""
FAILED_CMD=""
TEE=(tee -a)
TIMEOUT_BIN=""

usage() {
    cat <<'EOF'
Usage: scripts/deploy.sh [--dry-run] <tag>

  <tag>       release tag to deploy, vMAJOR.MINOR.PATCH (e.g. v1.2.8)
  --dry-run   run every preflight check, print the plan, change nothing
              (it does fetch tags, so it can see the target)
  -h, --help  show this help

Exit codes: 0 deployed, 1 failed and rolled back, 2 needs a human,
3 refused before changing anything. See docs/deploy.md.
EOF
}

log() {
    local line
    line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
    printf '%s\n' "$line" >>"$LOG_FILE"
    printf '%s\n' "$line" 2>/dev/null || true
}

# Preflight refusal. on_exit turns any preflight failure into exit 3.
die() {
    log "ERROR: $*"
    exit 3
}

# Runs an external command (never a shell function: it runs in a pipeline
# subshell) with its output going to the log as well as stdout.
run() {
    log "\$ $*"
    if [[ -n $TIMEOUT_BIN ]]; then
        set -- "$TIMEOUT_BIN" "$STEP_TIMEOUT" "$@"
    fi
    "$@" 2>&1 | "${TEE[@]}" "$LOG_FILE"
}

now_ms() {
    node -p 'Date.now()'
}

# ---------------------------------------------------------------------------
# The app process
# ---------------------------------------------------------------------------

# Arguments of a process, one per line. Exact on Linux (/proc keeps argument
# boundaries); elsewhere (only the local test harness) ps splits on spaces,
# which is fine for paths without them.
proc_args() {
    if [[ -r /proc/$1/cmdline ]]; then
        tr '\0' '\n' <"/proc/$1/cmdline"
    else
        ps -p "$1" -o args= | tr ' ' '\n'
    fi
}

# Something that changes if the PID is reused by a different process.
proc_start() {
    if [[ -r /proc/$1/stat ]]; then
        # Field 22 is the start time; strip "pid (comm) " first, since comm
        # can contain spaces.
        sed -E 's/^.*\) //' "/proc/$1/stat" | cut -d' ' -f20
    else
        ps -p "$1" -o lstart=
    fi
}

# The executable a process runs, symlinks resolved. /proc/<pid>/exe on
# Linux; elsewhere (only the local test harness) ps's comm, which there is
# the path the process was started with.
proc_exe() {
    if [[ -e /proc/$1/exe ]]; then
        readlink -f "/proc/$1/exe"
    else
        readlink -f "$(ps -p "$1" -o comm=)"
    fi
}

# Whether a process's executable is node. Never goes by the process name
# (comm): Node 24 on Linux renames its main thread to "MainThread", so
# `pgrep -x node` finds nothing. Falls back to argv[0] if the executable
# can't be read.
is_node_process() {
    local exe=""
    exe=$(proc_exe "$1" 2>/dev/null) || exe=""
    if [[ -z $exe ]]; then
        exe=$(proc_args "$1" 2>/dev/null | sed -n 1p) || exe=""
    fi
    # Linux appends this when the binary was replaced after the process
    # started (e.g. nvm reinstalled it); it's still the same node.
    exe=${exe% (deleted)}
    [[ ${exe##*/} == node ]]
}

# Every node process owned by this user with an argument exactly equal to
# the launcher path. pgrep -f only narrows the search to command lines
# containing the path somewhere; the exact-argument and executable checks
# decide. Never pkill -f: it would match any command line that merely
# contains "server.js".
find_app_pids() {
    local pid pattern
    # Escapes regex metacharacters; one bracket class reads better than a
    # ${var//} per character.
    # shellcheck disable=SC2001
    pattern=$(sed 's/[][\.*^$+?(){}|]/\\&/g' <<<"$LAUNCHER")
    for pid in $(pgrep -u "$(id -u)" -f -- "$pattern" || true); do
        if proc_args "$pid" 2>/dev/null | grep -Fqx -- "$LAUNCHER" && is_node_process "$pid"; then
            echo "$pid"
        fi
    done
}

# Prints the app's PID. Returns 1 if there is no app process, 2 if there is
# more than one (then nothing here is sure which to signal).
single_app_pid() {
    local pids count
    pids=$(find_app_pids)
    count=$(grep -c . <<<"$pids" || true)
    if ((count == 0)); then
        return 1
    elif ((count > 1)); then
        return 2
    fi
    echo "$pids"
}

# SIGTERM the app process, but only if PID $1 still is the process whose
# start time was $2.
kill_app() {
    local now=""
    now=$(proc_start "$1" 2>/dev/null) || now=""
    if [[ -z $now || $now != "$2" ]]; then
        log "Process $1 is no longer the app process seen earlier; not signalling it."
        return 1
    fi
    log "Sending SIGTERM to app process $1"
    kill -TERM "$1"
}

# Fetches one health URL and checks it reports status ok, version $2, and a
# start time no earlier than $3 (ms since epoch). $4 is local or public.
check_health() {
    local url=$1 want=$2 since=$3 where=$4 body=""
    local -a curl_args=(-fsS --max-time 10)
    if [[ $where == local ]]; then
        # Host passes hostCheck; X-Forwarded-Proto keeps the app's own
        # HTTPS redirect (if ever turned on) from answering 301, since
        # loopback is a trusted proxy.
        curl_args=(-fsS --max-time 5 -H "Host: $HOST_HEADER" -H 'X-Forwarded-Proto: https')
    fi
    if ! body=$(curl "${curl_args[@]}" "$url?deploy=$$-$SECONDS" 2>&1); then
        LAST_HEALTH="$where: $body"
        return 1
    fi
    LAST_HEALTH="$where: $body"
    HEALTH_BODY=$body node -e '
        const [want, since] = process.argv.slice(1);
        let h;
        try { h = JSON.parse(process.env.HEALTH_BODY); } catch { process.exit(1); }
        const ok = h.status === "ok" && h.version === want && Date.parse(h.startedAt) >= Number(since);
        process.exit(ok ? 0 : 1);
    ' "$want" "$since"
}

# Waits up to HEALTH_TIMEOUT for exactly one app process other than $3 whose
# local (and public, if configured) health reports version $1 and a start no
# earlier than $2. Never signals anything: callers restart at most once.
wait_healthy() {
    local want=$1 since=$2 old=${3:-} deadline pid=""
    deadline=$((SECONDS + HEALTH_TIMEOUT))
    HEALTH_SAW_PROCESS=0
    LAST_HEALTH=""
    log "Waiting up to ${HEALTH_TIMEOUT}s for a new app process serving $want"
    while ((SECONDS < deadline)); do
        pid=$(single_app_pid) || pid=""
        if [[ -n $pid && $pid != "$old" ]]; then
            HEALTH_SAW_PROCESS=1
            if check_health "http://127.0.0.1:$PORT/api/health" "$want" "$since" local &&
                { [[ -z $PUBLIC_HEALTH_URL ]] || check_health "$PUBLIC_HEALTH_URL" "$want" "$since" public; }; then
                log "Healthy: process $pid is serving $want"
                return 0
            fi
        fi
        sleep "$POLL_INTERVAL"
    done
    log "Timed out after ${HEALTH_TIMEOUT}s. App process: ${pid:-none}. Last health response: ${LAST_HEALTH:-none}"
    return 1
}

# ---------------------------------------------------------------------------
# Building. These run both in the deploy (set -e) and in the rollback
# (set +e), so every step checks its own result.
# ---------------------------------------------------------------------------

# Hash of a package-lock.json read from stdin, ignoring the root package's
# own version (bumped every release) and tied to the Node ABI and platform.
fingerprint() {
    node -e '
        let s = "";
        process.stdin.on("data", (d) => (s += d)).on("end", () => {
            const lock = JSON.parse(s);
            delete lock.version;
            if (lock.packages && lock.packages[""]) delete lock.packages[""].version;
            const input = [JSON.stringify(lock), process.versions.modules, process.platform, process.arch].join("\n");
            process.stdout.write(require("crypto").createHash("sha256").update(input).digest("hex"));
        });
    '
}

version_at() {
    git -C "$APP_DIR" show "$1:$2" |
        node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(String(JSON.parse(s).version)))'
}

# Installs the checked-out backend's production dependencies into STAGING and
# compiles better-sqlite3 from source. Its bundled prebuild needs glibc 2.34
# and its loader prefers that prebuild over build/Release, so the prebuilds
# have to go before the build, not just be outvoted by it.
prepare_backend() {
    log "Backend: installing dependencies in $STAGING"
    rm -rf "$STAGING" || return 1
    mkdir -p "$STAGING" || return 1
    cp "$BACKEND/package.json" "$BACKEND/package-lock.json" "$STAGING/" || return 1
    run npm ci --prefix "$STAGING" --omit=dev --no-audit --no-fund || return 1

    log "Backend: compiling better-sqlite3 from source"
    rm -rf "$STAGING/node_modules/better-sqlite3/prebuilds" || return 1
    run ${SCL[@]+"${SCL[@]}"} npm run build-release --prefix "$STAGING/node_modules/better-sqlite3" || return 1

    log "Backend: checking better-sqlite3 and bcrypt load"
    run node -e '
        const req = require("module").createRequire(require("path").join(process.argv[1], "noop.js"));
        req("better-sqlite3")(":memory:").close();
        req("bcrypt");
        console.log("better-sqlite3 and bcrypt load");
    ' "$STAGING" || return 1

    fingerprint <"$STAGING/package-lock.json" >"$STAGING/node_modules/$FINGERPRINT_FILE" || return 1
}

# Moves the staged node_modules into place, keeping the old one as
# node_modules.prev.
swap_backend() {
    log "Backend: swapping in the new node_modules"
    rm -rf "$BACKEND/node_modules.prev" || return 1
    BACKEND_SWAPPED=1
    if [[ -d $BACKEND/node_modules ]]; then
        mv "$BACKEND/node_modules" "$BACKEND/node_modules.prev" || return 1
    fi
    mv "$STAGING/node_modules" "$BACKEND/node_modules" || return 1
}

# Builds the checked-out frontend into dist.next. The live dist is untouched
# until swap_frontend, so the running app keeps serving a whole build.
build_frontend() {
    log "Frontend: installing dependencies and building into dist.next"
    rm -rf "$FRONTEND/dist.next" || return 1
    run npm ci --prefix "$FRONTEND" --no-audit --no-fund || return 1
    run npm run build --prefix "$FRONTEND" -- --outDir dist.next --emptyOutDir || return 1
    if [[ ! -f $FRONTEND/dist.next/index.html ]]; then
        log "Frontend: build produced no dist.next/index.html"
        return 1
    fi
}

swap_frontend() {
    log "Frontend: swapping in the new dist"
    rm -rf "$FRONTEND/dist.prev" || return 1
    FRONTEND_SWAPPED=1
    if [[ -d $FRONTEND/dist ]]; then
        mv "$FRONTEND/dist" "$FRONTEND/dist.prev" || return 1
    fi
    mv "$FRONTEND/dist.next" "$FRONTEND/dist" || return 1
}

# ---------------------------------------------------------------------------
# Preflight: nothing here changes the checkout, node_modules, dist or the
# running app.
# ---------------------------------------------------------------------------

select_node() {
    local pid=$1 exe="" rc=0
    if [[ -z $NODE_BIN && -e /proc/$pid/exe ]]; then
        exe=$(readlink -f "/proc/$pid/exe") && NODE_BIN=$(dirname "$exe")
    fi
    if [[ -n $NODE_BIN ]]; then
        PATH=$NODE_BIN:$PATH
    elif [[ -n $NVM_SH && -s $NVM_SH ]]; then
        # nvm isn't safe under set -eu, and a forced-command SSH session
        # never sources the profile that would normally load it.
        set +eu
        # shellcheck disable=SC1090
        . "$NVM_SH" && nvm use --silent "$NODE_VERSION" >/dev/null
        rc=$?
        set -eu
        ((rc == 0)) || die "nvm could not load Node $NODE_VERSION from $NVM_SH"
    fi
    command -v node >/dev/null || die "node not found"
    command -v npm >/dev/null || die "npm not found"
    log "Using node $(node -v) at $(command -v node)"
}

preflight() {
    local rc=0 target_sha pid_start

    exec 9>>"$LOCK_FILE"
    flock -n 9 || die "Another deploy is running (lock $LOCK_FILE is held)"

    git -C "$APP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
        die "$APP_DIR is not a git checkout"
    if [[ -n $(git -C "$APP_DIR" status --porcelain --untracked-files=no) ]]; then
        die "$APP_DIR has uncommitted changes to tracked files; refusing to deploy over them"
    fi

    OLD_SHA=$(git -C "$APP_DIR" rev-parse HEAD)
    OLD_DESC=$(git -C "$APP_DIR" describe --tags --exact-match HEAD 2>/dev/null || echo "commit ${OLD_SHA:0:12}")
    log "Live release: $OLD_DESC"

    APP_PID=$(single_app_pid) || rc=$?
    case $rc in
        0) ;;
        1) die "No app process found (a node process with the argument $LAUNCHER). Start the app in the Node.js Selector first." ;;
        *) die "More than one app process found: $(find_app_pids | tr '\n' ' ')" ;;
    esac
    pid_start=$(proc_start "$APP_PID")
    log "App process: $APP_PID (started $pid_start)"

    select_node "$APP_PID"
    OLD_VERSION=$(version_at "$OLD_SHA" backend/package.json)

    log "Fetching tags"
    run git -C "$APP_DIR" fetch --tags --quiet origin ||
        die "git fetch failed. If it says a tag would be clobbered, $TAG was moved on the remote; tags are never rewritten here."

    target_sha=$(git -C "$APP_DIR" rev-parse -q --verify "refs/tags/$TAG^{commit}") ||
        die "Tag $TAG does not exist on origin"
    if [[ $target_sha == "$OLD_SHA" ]]; then
        log "$TAG is already checked out; nothing to do."
        PHASE=finished
        exit 0
    fi

    git -C "$APP_DIR" cat-file -e "$TAG:backend/routes/health.js" 2>/dev/null ||
        die "$TAG has no /api/health (older than v1.2.7), so this script can't confirm it's live"

    TARGET_VERSION=${TAG#v}
    local backend_version frontend_version
    backend_version=$(version_at "$TAG" backend/package.json)
    frontend_version=$(version_at "$TAG" frontend/package.json)
    if [[ $backend_version != "$TARGET_VERSION" || $frontend_version != "$TARGET_VERSION" ]]; then
        die "$TAG's package.json versions (backend $backend_version, frontend $frontend_version) don't match the tag"
    fi

    local want have=""
    want=$(git -C "$APP_DIR" show "$TAG:backend/package-lock.json" | fingerprint)
    if [[ -f $BACKEND/node_modules/$FINGERPRINT_FILE ]]; then
        have=$(<"$BACKEND/node_modules/$FINGERPRINT_FILE")
    fi
    if [[ $want != "$have" ]]; then
        NEED_BACKEND=1
    fi
}

# ---------------------------------------------------------------------------
# Deploy and rollback
# ---------------------------------------------------------------------------

deploy() {
    local pid since pid_start
    PHASE=deploy

    log "Checking out $TAG"
    CHECKED_OUT=1
    git -C "$APP_DIR" -c advice.detachedHead=false checkout -q --detach "refs/tags/$TAG"

    if ((NEED_BACKEND)); then
        prepare_backend
    else
        log "Backend: dependencies unchanged since the last install; skipping npm ci"
    fi
    build_frontend

    # Everything that can fail slowly has succeeded; now the quick swaps.
    if ((NEED_BACKEND)); then
        swap_backend
    fi
    swap_frontend

    pid=$(single_app_pid) || { log "Expected exactly one app process before restarting"; return 1; }
    pid_start=$(proc_start "$pid")
    since=$(now_ms)
    RESTARTED=1
    kill_app "$pid" "$pid_start"
    wait_healthy "$TARGET_VERSION" "$since" "$pid"

    PHASE=finished
    rm -rf "$STAGING"
    log "=== Deployed $TAG in ${SECONDS}s (previous: $OLD_DESC) ==="
}

rollback_failed() {
    log "ROLLBACK FAILED: $*"
    log "The checkout and app may be in a mixed state. See 'Manual rollback' in docs/deploy.md."
}

# Puts back whatever deploy() changed, restarts only if deploy() restarted,
# and returns the script's exit code: 1 if the old release is live again, 2
# if not.
rollback() {
    local pid="" pid_start="" since rc=0
    PHASE=rollback
    log "=== Rolling back to $OLD_DESC ==="

    if ((CHECKED_OUT)); then
        if ! git -C "$APP_DIR" -c advice.detachedHead=false checkout -q --detach "$OLD_SHA"; then
            rollback_failed "git checkout $OLD_SHA failed"
            return 2
        fi
        log "Checked out $OLD_DESC again"
    fi

    if ((BACKEND_SWAPPED)); then
        if [[ -d $BACKEND/node_modules.prev ]]; then
            if ! { rm -rf "$BACKEND/node_modules" && mv "$BACKEND/node_modules.prev" "$BACKEND/node_modules"; }; then
                rollback_failed "could not restore backend/node_modules.prev"
                return 2
            fi
            log "Restored the previous backend/node_modules"
        elif ! { prepare_backend && rm -rf "$BACKEND/node_modules" && mv "$STAGING/node_modules" "$BACKEND/node_modules"; }; then
            rollback_failed "no node_modules backup, and reinstalling $OLD_DESC's failed"
            return 2
        fi
    fi

    if ((FRONTEND_SWAPPED)); then
        if [[ -d $FRONTEND/dist.prev ]]; then
            if ! { rm -rf "$FRONTEND/dist" && mv "$FRONTEND/dist.prev" "$FRONTEND/dist"; }; then
                rollback_failed "could not restore frontend/dist.prev"
                return 2
            fi
            log "Restored the previous frontend/dist"
        elif ! { build_frontend && rm -rf "$FRONTEND/dist" && mv "$FRONTEND/dist.next" "$FRONTEND/dist"; }; then
            rollback_failed "no dist backup, and rebuilding $OLD_DESC's frontend failed"
            return 2
        fi
    fi

    rm -rf "$STAGING" "$FRONTEND/dist.next"

    if ((!RESTARTED)); then
        log "The app was never restarted, so it is still serving $OLD_DESC. Rolled back without a restart."
        return 1
    fi

    # The one restart. Whatever is running now is the failed release (or
    # nothing, if the Selector gave up on it).
    pid=$(single_app_pid) || rc=$?
    if ((rc == 2)); then
        rollback_failed "more than one app process: $(find_app_pids | tr '\n' ' ')"
        return 2
    fi
    since=$(now_ms)
    if [[ -n $pid ]]; then
        pid_start=$(proc_start "$pid")
        kill_app "$pid" "$pid_start" || true
    else
        log "No app process is running; waiting for the Selector to start one"
    fi
    if wait_healthy "$OLD_VERSION" "$since" "$pid"; then
        log "=== Rolled back: $OLD_DESC is live. $TAG was NOT deployed. ==="
        return 1
    fi
    if ((!HEALTH_SAW_PROCESS)); then
        rollback_failed "no app process appeared within ${HEALTH_TIMEOUT}s. $OLD_DESC is checked out and built; press Restart for this app in the Node.js Selector control panel, then check /api/health."
    else
        rollback_failed "$OLD_DESC did not become healthy within ${HEALTH_TIMEOUT}s"
    fi
    return 2
}

on_exit() {
    local rc=$?
    trap - EXIT
    set +e
    case $PHASE in
        preflight)
            if ((rc != 0)); then
                if [[ -n $FAILED_CMD ]]; then
                    log "ERROR: preflight step failed at line $FAILED_AT: $FAILED_CMD"
                fi
                log "Refused; nothing was changed."
                rc=3
            fi
            ;;
        deploy)
            log "ERROR: deploy of $TAG failed at line ${FAILED_AT:-?}: ${FAILED_CMD:-signal or exit} (exit $rc)"
            rollback
            rc=$?
            ;;
    esac
    rm -f "${DEPLOY_SELF_COPY:-}"
    exit "$rc"
}

# ---------------------------------------------------------------------------

# Bash reads a script as it runs it, and the checkout below replaces this
# very file. Run from a private copy instead, so the whole deploy (rollback
# included) is the version that started it: the one currently live.
reexec_from_copy() {
    local copy
    if [[ -n ${DEPLOY_SELF_COPY:-} ]]; then
        return 0
    fi
    copy=$(mktemp "${TMPDIR:-/tmp}/deploy.sh.XXXXXX")
    cp -- "${BASH_SOURCE[0]}" "$copy"
    DEPLOY_SELF_COPY=$copy exec "$BASH" "$copy" "$@"
}

main() {
    if ((BASH_VERSINFO[0] < 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 4))); then
        echo "deploy.sh needs bash 4.4 or newer (this is $BASH_VERSION)" >&2
        exit 3
    fi
    reexec_from_copy "$@"

    while (($#)); do
        case $1 in
            --dry-run) DRY_RUN=1 ;;
            -h | --help) usage; rm -f "${DEPLOY_SELF_COPY:-}"; exit 0 ;;
            -*) echo "Unknown option: $1" >&2; usage >&2; rm -f "${DEPLOY_SELF_COPY:-}"; exit 3 ;;
            *)
                if [[ -n $TAG ]]; then
                    echo "Only one tag, please" >&2; rm -f "${DEPLOY_SELF_COPY:-}"; exit 3
                fi
                TAG=$1
                ;;
        esac
        shift
    done

    trap on_exit EXIT
    trap 'FAILED_AT=$LINENO; FAILED_CMD="$BASH_COMMAND (in ${FUNCNAME[0]:-main})"' ERR
    trap 'FAILED_CMD=SIGINT; exit 130' INT
    trap 'FAILED_CMD=SIGTERM; exit 143' TERM
    # A dropped SSH connection must not leave a half-done deploy behind.
    trap '' HUP

    mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"
    if tee -p -a /dev/null </dev/null >/dev/null 2>&1; then
        TEE=(tee -p -a)   # GNU: keep logging to the file if stdout goes away
    fi
    if command -v timeout >/dev/null; then
        TIMEOUT_BIN=timeout
    fi
    umask 022
    # npm ci would leave out the frontend's devDependencies (vite) under it.
    unset NODE_ENV
    # git fetch must fail, not wait for a password nobody will type.
    export GIT_TERMINAL_PROMPT=0

    local mode="" backend_plan="no, dependencies unchanged"
    if ((DRY_RUN)); then
        mode=" (dry run)"
    fi

    log "=== deploy.sh ${TAG:-<no tag>}$mode by $(id -un) ==="
    [[ -n $TAG ]] || { usage >&2; die "No tag given"; }
    [[ $TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Tag '$TAG' is not vMAJOR.MINOR.PATCH"

    preflight

    if ((NEED_BACKEND)); then
        backend_plan=yes
    fi
    log "Plan: $OLD_DESC ($OLD_VERSION) -> $TAG; backend reinstall: $backend_plan; restart process $APP_PID"
    if ((DRY_RUN)); then
        log "Dry run: stopping before any change."
        exit 0
    fi

    deploy
}

main "$@"
