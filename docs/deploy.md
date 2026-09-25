# Deploying to the webhost

[`scripts/deploy.sh`](../scripts/deploy.sh) deploys a release tag in one
command. It runs **on the server**, from the app checkout, never locally:

```bash
~/apps/research-repo-crud-ui/scripts/deploy.sh v1.2.8
~/apps/research-repo-crud-ui/scripts/deploy.sh --dry-run v1.2.8   # checks + plan, no changes
```

It's non-interactive and exits non-zero on any failure, so a GitHub Actions
workflow can call it later through a forced-command SSH key (see the end of
this page).

## The server

| What | Where |
|---|---|
| OS | Rocky Linux 8.10 (glibc 2.28), bash 4.4, `flock` from util-linux |
| `$HOME` | `/home` |
| Node | v24 via nvm, `/home/.nvm` (the app runs `/home/.nvm/versions/node/v24.21.0/bin/node`) |
| App checkout | `~/apps/research-repo-crud-ui`, always a release tag (detached HEAD) |
| Launcher | `~/www/ux-research.joshuabock.com/server.js`, run by the Node.js Selector; it requires `backend/server.js` from the checkout |
| Secrets | `backend/.env`, not in git. The script never reads or writes it. |
| Port | 26851 (`PORT` in `backend/.env`; the script has its own copy, `DEPLOY_PORT`) |
| Deploy log | `~/logs/deploy/research-repo-crud-ui.log`, outside the web root |
| Deploy state | `~/apps/.research-repo-crud-ui-deploy/`: the lock file and the backend staging directory |

The Selector restarts the app whenever its process exits, and it has
crash-loop protection. There's no Selector CLI on this host
(`cloudlinux-selector` and `selectorctl` don't exist), so a restart is a plain
`kill` (SIGTERM) of the app process. The Selector starts a new one within
about 20 seconds.

## What a deploy does

1. **Refuses (exit 3, nothing changed)** in any of these cases:
   - another deploy holds the lock;
   - the tag isn't exactly `vMAJOR.MINOR.PATCH`;
   - tracked files in the checkout have uncommitted changes;
   - there isn't exactly one app process (see [Finding the app process](#finding-the-app-process));
   - `git fetch` fails, or the tag doesn't exist;
   - the tag's `backend/package.json` and `frontend/package.json` versions don't equal the tag;
   - the tag has no `/api/health` (anything older than v1.2.7).
2. **Records the live release** (the tag at HEAD) for rollback.
3. **Checks out the tag.**
4. **Backend, only if its dependencies changed.** It compares a fingerprint of
   `backend/package-lock.json` (ignoring the package's own version, plus the
   Node ABI) with `backend/node_modules/.deploy-fingerprint`. If they differ,
   it installs into the staging directory:
   `npm ci --omit=dev`, then compiles better-sqlite3 from source (see
   below), then checks that `better-sqlite3` and `bcrypt` load. The running
   app keeps its `node_modules` throughout.
5. **Frontend:** `npm ci` and `npm run build` into `frontend/dist.next`. The
   live `dist` keeps serving throughout.
6. **Swaps** in the new `node_modules` and `dist`. The old ones become
   `backend/node_modules.prev` and `frontend/dist.prev`.
7. **Restarts:** SIGTERM to the app process, never `-9`. Its start time is
   checked again just before the signal, so a reused PID is never killed.
8. **Waits** (120s by default) for a *new* app process. That process must
   answer `http://127.0.0.1:26851/api/health` (sent with the right `Host`),
   then the public `https://ux-research.joshuabock.com/api/health`. Both must
   report `status: ok`, the tag's version, and a `startedAt` later than the
   SIGTERM.

**On any failure after the checkout** it rolls back:
- It checks out the previous tag again and moves `node_modules.prev` and
  `dist.prev` back into place.
- It restarts **only if the deploy had already restarted**, and **at most
  once**. If the failure came before the restart (for example a build error),
  the old process never stopped serving and isn't touched.
- It then waits for the old version's health the same way, and exits 1.

**It exits 2 (needs a human)** in either of these cases:
- the rollback itself fails;
- no app process appears after the rollback. The Selector may have given up
  on a crashing release. The log then says to **press Restart for the app in
  the Node.js Selector control panel**. The script never retries a restart in
  a loop.

The script that runs is always the live release's copy. It re-executes from
a temporary copy of itself before the checkout replaces the file, and all its
code sits in functions called from the last line. So a change to
`deploy.sh` takes effect from the deploy *after* the release that contains it.

### Finding the app process

The app process is the one process owned by this user that has both of
these:

- an argument exactly equal to the launcher path,
  `/home/www/ux-research.joshuabock.com/server.js`, read from
  `/proc/<pid>/cmdline`, which keeps argument boundaries;
- an executable, `/proc/<pid>/exe` with symlinks resolved, whose name is
  `node`. If the executable can't be read, the script uses the name in
  argv[0].

It never goes by the process name (comm). Node 24 on Linux renames its main
thread, so the app shows up as `MainThread`:

```
$ ps -o pid,comm,args -u "$USER" | grep '[s]erver.js'
27769 MainThread  /home/.nvm/versions/node/v24.21.0/bin/node /home/www/ux-research.joshuabock.com/server.js
$ pgrep -u "$(id -u)" -x node; echo $?
1
```

`pgrep -f` with the launcher path only narrows down which processes to
check. The exact-argument and executable checks decide. So none of these
counts, and none is ever signalled: `server.js.bak`, another node process
running some other `server.js`, or a non-node process that happens to have
the launcher path as an argument.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Deployed. Also returned by `--dry-run`, and when the tag is already live. |
| 1 | Deploy failed and was rolled back; the previous release is live |
| 2 | Rollback failed or the app didn't come back: see [Manual rollback](#manual-rollback) |
| 3 | Refused before changing anything |

### better-sqlite3 on glibc 2.28

better-sqlite3 13 ships prebuilt binaries inside the package, and the Linux
one needs glibc 2.34. Its loader always tries `prebuilds/linux-x64.node`
before `build/Release/better_sqlite3.node`. Its `binding.gyp` also skips
compiling whenever a prebuild exists. That means
`npm rebuild --build-from-source` compiles nothing. The script instead does:

```bash
rm -rf node_modules/better-sqlite3/prebuilds
scl enable gcc-toolset-14 -- npm run build-release --prefix node_modules/better-sqlite3
node -e "require('better-sqlite3')(':memory:'); require('bcrypt')"
```

`build-release` is the package's own `node-gyp rebuild --release
--force_build=1`. System Python 3.13 is fine for node-gyp. bcrypt's glibc
prebuild only needs glibc 2.14, so it's used as-is.

## One-time manual deploy of v1.2.7

v1.2.6, the release live when `deploy.sh` was added, doesn't contain the
script. So v1.2.7 is deployed by hand, once. After that, every deploy is
`scripts/deploy.sh <tag>`.

Before starting: v1.2.7 is merged to `main`, tagged `v1.2.7`, and the tag is
pushed.

1. **SSH in and load Node 24.** A plain SSH session may not load nvm. Make
   sure `NODE_ENV` isn't `production`, or `npm ci` skips vite:

   ```bash
   source ~/.nvm/nvm.sh && nvm use 24
   unset NODE_ENV
   node -v    # v24.x
   ```

2. **Check the checkout is clean and on v1.2.6:**

   ```bash
   cd ~/apps/research-repo-crud-ui
   git status --porcelain --untracked-files=no    # must print nothing
   git describe --tags --exact-match              # v1.2.6
   ```

3. **Fetch and check out v1.2.7:**

   ```bash
   git fetch --tags origin
   git -c advice.detachedHead=false checkout v1.2.7
   ```

4. **Backend.** Between v1.2.6 and v1.2.7 the lockfile only changes the
   package's own version, so the installed `node_modules`, including the
   compiled better-sqlite3, stays as it is. Confirm that:

   ```bash
   git diff v1.2.6 v1.2.7 -- backend/package-lock.json    # only "version": "1.0.0" -> "1.2.7" lines
   (cd backend && node -e "require('better-sqlite3')(':memory:'); require('bcrypt'); console.log('ok')")
   ```

   If the diff shows more than version lines, reinstall before going on:

   ```bash
   cd backend
   npm ci --omit=dev
   rm -rf node_modules/better-sqlite3/prebuilds
   scl enable gcc-toolset-14 -- npm run build-release --prefix node_modules/better-sqlite3
   node -e "require('better-sqlite3')(':memory:'); require('bcrypt'); console.log('ok')"
   cd ..
   ```

   `node_modules` has no `.deploy-fingerprint` yet, so the first scripted
   deploy reinstalls the backend once. That's expected.

5. **Frontend.** Build next to the live `dist`, then swap:

   ```bash
   cd frontend
   npm ci
   npm run build -- --outDir dist.next --emptyOutDir
   test -f dist.next/index.html && echo built
   rm -rf dist.prev && mv dist dist.prev && mv dist.next dist
   cd ..
   ```

6. **Restart.** Find the app process, the one whose command line is exactly
   the launcher, and send it SIGTERM (a plain `kill`, never `kill -9`):

   ```bash
   ps -o pid,lstart,args -u "$USER" | grep '[w]ww/ux-research.joshuabock.com/server.js'
   kill <pid>
   ```

7. **Check it's live.** Within about 20 seconds, `ps` should show a new PID
   and health should report 1.2.7:

   ```bash
   ps -o pid,lstart,args -u "$USER" | grep '[w]ww/ux-research.joshuabock.com/server.js'
   curl -s https://ux-research.joshuabock.com/api/health
   # {"status":"ok","version":"1.2.7","startedAt":"..."}
   ```

   Then load the site, log in through the demo picker, and check the footer
   says v1.2.7.

8. **Check the script works on this server.** Deploying the live tag is a
   no-op, but it still runs every check that doesn't need a new tag: lock,
   clean tree, finding the process, loading Node, and fetching:

   ```bash
   scripts/deploy.sh --dry-run v1.2.7    # "... v1.2.7 is already checked out; nothing to do." exit 0
   tail ~/logs/deploy/research-repo-crud-ui.log
   ```

**If step 7 fails,** go back to v1.2.6 by hand:

```bash
git -c advice.detachedHead=false checkout v1.2.6
rm -rf frontend/dist && mv frontend/dist.prev frontend/dist
kill <pid of the app process>
```

If there's no app process to kill, press Restart in the Node.js Selector.

## Manual rollback

Only needed after exit 2. Read the end of `~/logs/deploy/research-repo-crud-ui.log` first.
It says which step failed.

1. Make sure no deploy is running: `flock -n ~/apps/.research-repo-crud-ui-deploy/deploy.lock true`
   succeeds.
2. Check out the release that should be live:
   `git -C ~/apps/research-repo-crud-ui checkout <tag>`.
3. If the log shows `node_modules` or `dist` were swapped and not restored,
   move the `.prev` copy back:
   - `rm -rf backend/node_modules && mv backend/node_modules.prev backend/node_modules`
   - the same for `frontend/dist` and `frontend/dist.prev`
4. Restart. If an app process exists, `kill` it once. Otherwise press Restart
   in the Node.js Selector.
5. Check `curl -s https://ux-research.joshuabock.com/api/health` reports the
   expected version.

## Configuration

Every path and setting has a default for this server and can be overridden
through the environment. The test harness uses these overrides.

| Variable | Default |
|---|---|
| `DEPLOY_APP_DIR` | `~/apps/research-repo-crud-ui` |
| `DEPLOY_LAUNCHER` | `~/www/ux-research.joshuabock.com/server.js` |
| `DEPLOY_PORT` | `26851` |
| `DEPLOY_HOST` | `ux-research.joshuabock.com` (the `Host` sent to the local health check) |
| `DEPLOY_HEALTH_URL` | `https://ux-research.joshuabock.com/api/health`; set it empty to skip the public check |
| `DEPLOY_HEALTH_TIMEOUT` / `DEPLOY_POLL_INTERVAL` | `120` / `3` seconds |
| `DEPLOY_STEP_TIMEOUT` | `1200` seconds per npm or git step |
| `DEPLOY_STATE_DIR` | `~/apps/.research-repo-crud-ui-deploy`; must be on the same filesystem as the checkout |
| `DEPLOY_LOCK_FILE` | `$DEPLOY_STATE_DIR/deploy.lock` |
| `DEPLOY_LOG_FILE` | `~/logs/deploy/research-repo-crud-ui.log` |
| `DEPLOY_NODE_BIN` | empty: use the directory of the running app's own `node` (`/proc/<pid>/exe`) |
| `DEPLOY_NVM_SH` / `DEPLOY_NODE_VERSION` | `~/.nvm/nvm.sh` / `24`; only used if the app's node can't be found |
| `DEPLOY_SCL` | `scl enable gcc-toolset-14 --`; the prefix for the better-sqlite3 compile |

The log isn't rotated. It grows by a few hundred lines per deploy.

## Testing the script

```bash
shellcheck scripts/deploy.sh scripts/tests/deploy.test.sh
scripts/tests/deploy.test.sh
```

[`scripts/tests/deploy.test.sh`](../scripts/tests/deploy.test.sh) runs the
real script against a throwaway setup:
- an origin with release tags, and a checkout of it;
- stand-ins for `npm` and `scl`;
- a tiny app with `/api/health`;
- a loop that restarts the app like the Selector does, and can give up after
  repeated crashes like its crash-loop protection.

It covers every refusal, the dry run, and a normal deploy. It checks that a
version-only bump skips the backend install and that a dependency change
reinstalls it. It covers frontend-build and better-sqlite3-compile failures
(rolled back without a restart), a release that crashes at startup (rolled
back with one restart), and the Selector giving up (exit 2). It also checks
that near-miss processes are never signalled: node with similar arguments,
and a non-node process with the launcher path as an argument.

The fake app runs node through a symlink named `MainThread`, so its process
name is `MainThread` on every OS, as the real app's is under Node 24 on
Linux. The harness checks that `pgrep -x node` can't see it. Every refusal
test checks its own error message as well as exit 3. The harness starts
with a dry run of a valid tag and stops at once if that fails, so a broken
process lookup can't show up as a run of passing refusals.

It needs bash 4.4+, `flock`, git, node, curl and perl. CI runs it on Linux. On
macOS, `brew install bash flock` and run it with Homebrew's bash. There the
script falls back from `/proc` to `ps`, so the `/proc` code paths are only
exercised in CI. Neither place can test the real `npm ci`, the gcc-toolset
compile, or Cloudflare. The first real deploy covers those.

## Later: deploying from GitHub Actions

The plan is a GitHub Actions workflow that SSHes in with a key restricted in
`~/.ssh/authorized_keys` to a forced command. That command is a small wrapper
outside the checkout. It accepts only `deploy vX.Y.Z`, taken from
`SSH_ORIGINAL_COMMAND`, and runs `scripts/deploy.sh` with that tag. The
wrapper and workflow aren't part of this repo yet. The script is ready for
them: it doesn't prompt, it ignores SIGHUP so a dropped connection can't stop
it halfway, it validates the tag itself, and its exit code says what
happened.
