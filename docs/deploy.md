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

`scripts/deploy.sh` defines this reference deployment's actual paths near
its top (`APP_DIR`, `LAUNCHER`, and the rest — see
[Configuration](#configuration)); adjust them for a different host.

| What | Where |
|---|---|
| OS | Rocky Linux 8.10 (glibc 2.28), bash 4.4, `flock` from util-linux |
| `$HOME` | `/home` |
| Node | v24, installed by the process manager (see below) under a path shaped like a Node version manager's, e.g. `<node-bin>` — though no version manager is actually installed on this host; its shell config puts that directory on `PATH` directly. |
| App checkout | `~/apps/research-repo-crud-ui`, always a release tag (detached HEAD) |
| Launcher | `<launcher>`, run by the process manager; it requires `backend/server.js` from the checkout |
| Secrets | `backend/.env`, not in git. The script never reads or writes it. |
| Port | 26851 (`PORT` in `backend/.env`; the script has its own copy, `DEPLOY_PORT`) |
| Deploy log | `~/logs/deploy/research-repo-crud-ui.log`, outside the web root |
| Deploy state | `~/apps/.research-repo-crud-ui-deploy/`: the lock file and the backend staging directory |

Some shared hosts run Node apps through a control-panel feature that assigns
the port, expects the app at a specific launcher path, and restarts it
whenever its process exits, with crash-loop protection — this doc calls
that **the process manager** below. There's no CLI for it on this host, so
a restart is a plain `kill` (SIGTERM) of the app process; it starts a new
one within about 20 seconds.

## What a deploy does

1. **Refuses (exit 3, nothing changed)** in any of these cases:
   - another deploy holds the lock;
   - the tag isn't exactly `vMAJOR.MINOR.PATCH`;
   - tracked files in the checkout have uncommitted changes;
   - there isn't exactly one app process (see [Finding the app process](#finding-the-app-process));
   - `git fetch` fails — including two cases it names specifically: the tag
     was moved forward on origin, or the local and origin tags have
     diverged onto different commits entirely. Either message includes the
     recovery command (`git tag -d <tag> && git fetch --tags origin`), for
     when the move was intentional — or the tag doesn't exist at all;
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
- no app process appears after the rollback. The process manager may have
  given up on a crashing release. The log then says to **press Restart for
  the app in the host's control panel**. The script never retries a restart
  in a loop.

The script that runs is always the live release's copy. It re-executes from
a temporary copy of itself before the checkout replaces the file, and all its
code sits in functions called from the last line. So a change to
`deploy.sh` takes effect from the deploy *after* the release that contains it.
(v1.2.8 is the one exception: see
[One-time deploy of v1.2.8](#one-time-deploy-of-v128-run-its-own-copy).)

### Finding the app process

The app process is the one process owned by this user that has both of
these:

- an argument exactly equal to the launcher path, `<launcher>` (`LAUNCHER`
  at the top of `scripts/deploy.sh`), read from `/proc/<pid>/cmdline`,
  which keeps argument boundaries;
- an executable, `/proc/<pid>/exe` with symlinks resolved, whose name is
  `node`.

The same `node` is the one the deploy uses: its directory goes first on
`PATH`, and `npm` must be next to it. The script never relies on `node`
already being on `PATH`.

Some hosts, this one included, refuse to read `/proc/<pid>/exe` even for your
own processes (`ls -l /proc/<pid>/exe` says "Permission denied"), while
`/proc/<pid>/cmdline` stays readable. The script then uses argv[0] from
`/proc/<pid>/cmdline` instead, but only if it's an absolute path to an
executable named `node`, as it is here. The log says which one it used:

```
App's node: <node-bin> (from the argv[0] of process 11571; its exe link can't be read)
```

Whether to use `/proc` at all is decided once, from the script's own process.
On Linux it never falls back to `ps` for a process: a process `/proc` can't
describe doesn't count as the app. The `ps` fallback exists only for systems
without `/proc` (macOS, where the test harness runs locally).

It never goes by the process name (comm). Node 24 on Linux renames its main
thread, so the app shows up as `MainThread`:

```
$ ps -o pid,comm,args -u "$USER" | grep '[s]erver.js'
27769 MainThread  <node-bin> <launcher>
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

1. **SSH in and check Node 24 is on `PATH`.** It is in an interactive SSH
   session on this host; there's no version manager to load. If `node -v`
   isn't v24, put the app's own node first. Make sure `NODE_ENV` isn't
   `production`, or `npm ci` skips vite:

   ```bash
   command -v node && node -v    # v24.x
   # only if it isn't (use the directory <node-bin> above lives in):
   export PATH=<node-bin-dir>:$PATH
   unset NODE_ENV
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
   ps -o pid,lstart,args -u "$USER" | grep '[s]erver.js'
   kill <pid>
   ```

7. **Check it's live.** Within about 20 seconds, `ps` should show a new PID
   and health should report 1.2.7:

   ```bash
   ps -o pid,lstart,args -u "$USER" | grep '[s]erver.js'
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

If there's no app process to kill, press Restart in the host's control panel.

## One-time deploy of v1.2.8 (run its own copy)

v1.2.7's `deploy.sh` can never deploy on this host. It can't read
`/proc/<pid>/exe`, and it then refuses with "No app process found" (see
[Finding the app process](#finding-the-app-process)). Normally the live
release's copy of the script runs the deploy, so v1.2.8 has to be deployed by
running **v1.2.8's own copy**, once. From v1.2.9 on, deploys go back to
`scripts/deploy.sh <tag>`.

This is safe. The script doesn't care where it's run from: every path comes
from its defaults (or `DEPLOY_*`), not from the script's own location. It
still re-executes from a private temporary copy, which is harmless. For this
one deploy the rollback code is v1.2.8's too.

Before starting: v1.2.8 is merged to `main`, tagged `v1.2.8`, and the tag is
pushed.

1. **Fetch the tag.** `git show` below needs it locally:

   ```bash
   git -C ~/apps/research-repo-crud-ui fetch --tags origin
   ```

2. **Extract v1.2.8's script** outside the checkout:

   ```bash
   git -C ~/apps/research-repo-crud-ui show v1.2.8:scripts/deploy.sh > ~/deploy-v1.2.8.sh
   ```

3. **Dry run, then deploy.** Run it with `bash` rather than `chmod +x`, so a
   `noexec` mount can't get in the way. The dry run should find the app
   process, log `App's node: ... (from the argv[0] of process ...)` and plan
   `backend reinstall: yes`. That's expected, because the hand-deployed
   v1.2.7 has no `.deploy-fingerprint`:

   ```bash
   bash ~/deploy-v1.2.8.sh --dry-run v1.2.8
   bash ~/deploy-v1.2.8.sh v1.2.8
   ```

4. **Remove the copy.** The script deletes its own temporary copy, not this
   one:

   ```bash
   rm ~/deploy-v1.2.8.sh
   ```

5. **Check** `curl -s https://ux-research.joshuabock.com/api/health` reports
   1.2.8, and the footer says v1.2.8.

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
   in the host's control panel.
5. Check `curl -s https://ux-research.joshuabock.com/api/health` reports the
   expected version.

## Configuration

Every path and setting has a default for this server and can be overridden
through the environment. The test harness uses these overrides.

| Variable | Default |
|---|---|
| `DEPLOY_APP_DIR` | `~/apps/research-repo-crud-ui` |
| `DEPLOY_LAUNCHER` | `<launcher>` — this reference deployment's actual value is set at the top of `scripts/deploy.sh` |
| `DEPLOY_PORT` | `26851` |
| `DEPLOY_HOST` | `ux-research.joshuabock.com` (the `Host` sent to the local health check) |
| `DEPLOY_HEALTH_URL` | `https://ux-research.joshuabock.com/api/health`; set it empty to skip the public check |
| `DEPLOY_HEALTH_TIMEOUT` / `DEPLOY_POLL_INTERVAL` | `120` / `3` seconds |
| `DEPLOY_STEP_TIMEOUT` | `1200` seconds per npm or git step |
| `DEPLOY_STATE_DIR` | `~/apps/.research-repo-crud-ui-deploy`; must be on the same filesystem as the checkout |
| `DEPLOY_LOCK_FILE` | `$DEPLOY_STATE_DIR/deploy.lock` |
| `DEPLOY_LOG_FILE` | `~/logs/deploy/research-repo-crud-ui.log` |
| `DEPLOY_NODE_BIN` | empty: use the directory of the running app's own `node` (`/proc/<pid>/exe`, else argv[0]; see [Finding the app process](#finding-the-app-process)) |
| `DEPLOY_SCL` | `scl enable gcc-toolset-14 --`; the prefix for the better-sqlite3 compile |

The log isn't rotated. It grows by a few hundred lines per deploy.

## Testing the script

The `deploy-script` job in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the source of
truth for the exact commands; this is the same thing locally:

```bash
shellcheck scripts/deploy.sh scripts/tests/deploy.test.sh scripts/ssh-retry-classify.sh scripts/tests/ssh-retry-classify.test.sh
scripts/tests/deploy.test.sh
scripts/tests/ssh-retry-classify.test.sh
```

[`scripts/tests/deploy.test.sh`](../scripts/tests/deploy.test.sh) runs the
real script against a throwaway setup:
- an origin with release tags, and a checkout of it;
- stand-ins for `npm` and `scl`;
- a tiny app with `/api/health`;
- a loop that restarts the app like the process manager does, and can give
  up after repeated crashes like its crash-loop protection.

It covers every refusal, the dry run, and a normal deploy. It checks that a
version-only bump skips the backend install and that a dependency change
reinstalls it. It covers frontend-build and better-sqlite3-compile failures
(rolled back without a restart), a release that crashes at startup (rolled
back with one restart), and the process manager giving up (exit 2). It also checks
that near-miss processes are never signalled: node with similar arguments,
and a non-node process with the launcher path as an argument.

It also simulates a host that refuses to read `/proc/<pid>/exe`. A `readlink`
stub first on `PATH` fails for `/proc/<pid>/exe`, as GNU `readlink -f` does
there, and the app is started with argv[0] set to an absolute `.../node`, as
the process manager does. A dry run and a deploy must then find the app through
argv[0] and deploy with that `node`. A `ps` stub proves `ps` never runs. Two
decoys must be left alone: node with the launcher argument and a relative
argv[0], and one with an argv[0] not named `node`. The stub only models the
host because `deploy.sh` reads the exe link in exactly one place, with a
plain `readlink -f`. The harness checks that on every OS.

The fake app runs node through a symlink named `MainThread`, so its process
name is `MainThread` on every OS, as the real app's is under Node 24 on
Linux. The harness checks that `pgrep -x node` can't see it. Every refusal
test checks its own error message as well as exit 3. The harness starts
with a dry run of a valid tag and stops at once if that fails, so a broken
process lookup can't show up as a run of passing refusals.

It needs bash 4.4+, `flock`, git, node, curl and perl. CI runs it on Linux. On
macOS, `brew install bash flock` and run it with Homebrew's bash. There the
script falls back from `/proc` to `ps`, so the `/proc` code paths, including
the unreadable-exe phase (reported as `SKIP`), are only exercised in CI.
Neither place can test the real `npm ci`, the gcc-toolset compile, or
Cloudflare. The first real deploy covers those.

[`scripts/tests/ssh-retry-classify.test.sh`](../scripts/tests/ssh-retry-classify.test.sh)
tests [`scripts/ssh-retry-classify.sh`](../scripts/ssh-retry-classify.sh)
directly: it feeds the classifier each known failure string (and near-miss
text that shouldn't match) against exit code 255, and separately checks exit
codes 0-3 are never retried regardless of their output.

## Deploying from GitHub Actions

Pushing a `vX.Y.Z` tag triggers
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which SSHes
into the server with a key restricted to one forced command and runs
[`scripts/ssh-deploy-wrapper.sh`](../scripts/ssh-deploy-wrapper.sh) there. No
shell is ever reachable through that key.

### How it works

1. **`verify` job.** Checks the tag matches `vMAJOR.MINOR.PATCH`, then checks
   out the tag's commit and confirms it's an ancestor of `origin/main`. That
   second check matters: branch protection only ever examined commits that
   reached `main` through a PR, so a tag pushed at some other commit could
   otherwise skip the 5 required CI checks entirely. `deploy` only runs if
   this passes.
2. **`deploy` job.** Re-checks the tag format (belt and suspenders — the
   value flows into an SSH command), writes the SSH private key and pinned
   host key from GitHub secrets to temp files, then runs
   `ssh ... "$SSH_USER@$SSH_HOST" "deploy $TAG"`.
3. **The forced command.** `~/.ssh/authorized_keys` on the server pins the
   deploy key to `command="<path to ssh-deploy-wrapper.sh>"`, so SSH runs the
   wrapper regardless of what the client asked for; the client's request
   lands only in `$SSH_ORIGINAL_COMMAND`. The wrapper accepts exactly
   `deploy vMAJOR.MINOR.PATCH` (same regex as `deploy.sh`'s own tag check)
   and refuses everything else, logging every attempt (accepted or refused)
   to `~/logs/deploy/ssh-wrapper.log`. On a match it `exec`s
   `scripts/deploy.sh <tag>` from the live checkout — the same script and
   same rules as a manual deploy, including the lock, so a workflow run and
   a person running `deploy.sh` by hand can never race each other.
4. **Exit codes propagate.** `deploy.sh`'s 0/1/2/3 (see
   [Exit codes](#exit-codes)) become the SSH session's exit status, and the
   workflow step maps each one to a clear `::notice::`/`::error::` and the
   job's pass/fail.

### The connection-refusal retry

[`scripts/ssh-retry-classify.sh`](../scripts/ssh-retry-classify.sh) (tested by
[`scripts/tests/ssh-retry-classify.test.sh`](../scripts/tests/ssh-retry-classify.test.sh))
decides, from one SSH attempt's exit code and output, whether the workflow
step should retry it or fail loud.

The shared host occasionally refuses new SSH connections before
authentication, and OpenSSH describes that differently depending on exactly
how the connection was dropped: a `kex_exchange_identification` banner
refusal (host support confirmed this is the server being out of connection
slots, not anything IP- or account-specific), a plain TCP-level `Connection
refused`, a `Not allowed at this time` refusal, or — the wording this
workflow step's non-verbose output actually produces — `Connection closed by
<host> port <port>` or `Connection reset by <host> port <port>` (the
verbose-only phrasing, `Connection closed by remote host`, is matched too, in
case that ever shows up). All of these happen **before** `deploy.sh` ever
starts, so all are safe to retry the same way: the workflow retries an SSH
exit 255 matching one of these, up to 3 times (10s/30s/60s backoff), and
nothing else. A real auth failure or host-key mismatch is also exit 255 but
won't match the retried text, so it fails loud on the first attempt instead
of retrying something that retrying can't fix. Once a connection succeeds and
`deploy.sh` actually runs (exit 0-3), that result is never retried — stacking
a second deploy attempt on top of a live rollback would be worse than a
failed workflow run.

One thing the text match can't tell apart: `Connection closed/reset by ...
port ...` can also happen *after* `deploy.sh` has already started on the
server, not just before — SSH can't say when in the session the drop
happened, so the wording is identical either way. A resulting retry is safe
rather than racy because `deploy.sh` ignores SIGHUP (`trap '' HUP`, set right
after argument parsing) specifically so a dropped connection doesn't kill a
deploy partway through, and its own `flock` (see
[Configuration](#configuration)) refuses a second concurrent run rather than
stacking one on top of the first. A retry after a mid-session drop can still
end the workflow run with a misleading "refused, nothing changed" while the
first attempt's `deploy.sh` keeps running to completion in the background —
that's a confusing job result, not a double-deploy risk.

`SSH_ORIGINAL_COMMAND` populating correctly under a `bash <path>` forced
command (rather than the wrapper's own path directly) was confirmed against a
local test `sshd`: it reflects exactly what the client sent, is unset when no
command is given, and is passed through as a raw string rather than evaluated
— the wrapper's regex match against it is the actual security boundary, not
how the forced command happens to invoke it.

### Setting up the deploy key (one-time, by hand)

None of this is automated; it's server and GitHub configuration, done once.

1. **Generate a dedicated keypair** (not reused for anything else):
   ```bash
   ssh-keygen -t ed25519 -f github-actions-deploy -N "" -C github-actions-deploy
   ```
2. **Install the wrapper on the server, outside the app checkout** (it must
   keep working no matter what `~/apps/research-repo-crud-ui` has checked
   out, or is mid-deploying):
   ```bash
   scp scripts/ssh-deploy-wrapper.sh user@host:~/scripts/ssh-deploy-wrapper.sh
   ssh user@host chmod +x ~/scripts/ssh-deploy-wrapper.sh
   ```
   Re-run this `scp` whenever the wrapper changes in the repo — it is not
   picked up automatically like `deploy.sh` is.
3. **Add the forced-command entry to `~/.ssh/authorized_keys`** on the
   server (one line, no line breaks):
   ```
   command="/home/scripts/ssh-deploy-wrapper.sh",no-pty,no-agent-forwarding,no-X11-forwarding,no-port-forwarding,no-user-rc ssh-ed25519 AAAA... github-actions-deploy
   ```
   Use the *public* key (`github-actions-deploy.pub`) here.
4. **Pin the host key**, so the workflow can set `StrictHostKeyChecking=yes`
   against a known value instead of trusting whatever the server presents on
   first connect:
   ```bash
   ssh-keyscan -t ed25519 -p <port> <host> > host-key.pub
   ```
   Verify this against the host's actual fingerprint out of band (e.g. the
   hosting control panel) before trusting it — `ssh-keyscan`'s own output is
   not itself a verification.
5. **Add GitHub repo secrets** (Settings → Environments → `production`, or
   Settings → Secrets and variables → Actions if not gating by environment):
   | Secret | Value |
   |---|---|
   | `DEPLOY_SSH_HOST` | the server's hostname |
   | `DEPLOY_SSH_PORT` | its SSH port |
   | `DEPLOY_SSH_USER` | the deploy user |
   | `DEPLOY_SSH_PRIVATE_KEY` | contents of `github-actions-deploy` (the private key) |
   | `DEPLOY_SSH_HOST_KEY` | contents of `host-key.pub` from step 4 |
6. **Delete the local keypair files** once the private key is in GitHub
   secrets and the public key is in `authorized_keys` — don't leave copies
   lying around.

### Testing the setup

Before relying on it for a real release:

- From your own machine, confirm the forced command works and nothing else
  does:
  ```bash
  ssh -i github-actions-deploy -p <port> user@host "deploy v1.2.9"    # should run deploy.sh
  ssh -i github-actions-deploy -p <port> user@host "bash"             # should be refused
  ssh -i github-actions-deploy -p <port> user@host                    # should be refused (no command)
  ```
- Check `~/logs/deploy/ssh-wrapper.log` shows the attempts above, accepted
  and refused.
- Push a real tag and watch the Actions run end to end, including that the
  `verify` job actually blocks a tag pushed at a commit not on `main`.
- Confirm a deploy triggered by the workflow and one run by hand from the
  server can't run concurrently: `deploy.sh`'s own lock (see
  [Configuration](#configuration)) covers this, but it's worth seeing the
  second one refuse with exit 3 rather than assuming.

### Rotating the deploy key

Do this periodically, or immediately if the private key may have leaked.
The old key stays valid until step 7, so a botched rotation can't lock you
out.

1. **Generate a new dedicated keypair directly under `~/.ssh`**, not the
   current directory — that way the private key can never end up inside
   this repo's working tree by accident:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/<key-name> -N "" -C github-actions-deploy
   ```
   Keep both this and the old key's files locally until the rotation is
   confirmed working end to end in step 6.
2. **Back up `~/.ssh/authorized_keys` on the server**, then add the new
   public key as a second forced-command entry, copying the exact
   restriction stanza from the existing line (`command=`, `no-pty`,
   `no-agent-forwarding`, `no-X11-forwarding`, `no-port-forwarding`,
   `no-user-rc`):
   ```bash
   ssh user@host cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak
   ```
   Then append the new line by hand — `ssh-copy-id` won't add the
   restrictions, so don't use it here.
3. **Test the new key authenticates, without triggering a real deploy:**
   ```bash
   ssh -N -i ~/.ssh/<key-name> -p <port> -o IdentitiesOnly=yes user@host
   ```
   `-N` tells SSH not to send a command at all, so the forced command in
   `authorized_keys` never runs; this only proves the key and its
   `authorized_keys` entry are valid, without exercising a deploy.
4. **Load the new private key into the production environment secret:**
   ```bash
   pbcopy < ~/.ssh/<key-name>
   ```
   Paste into Settings → Environments → `production` →
   `DEPLOY_SSH_PRIVATE_KEY`. Environment secrets override repo-level secrets
   of the same name, so this takes effect on the next tag push without
   touching anything else.
5. **Don't regenerate `DEPLOY_SSH_HOST_KEY` as part of this** unless the
   server's host key itself changed — key rotation only replaces the client
   key, not the host's identity. If you do need to rebuild it, remember that
   for a non-default port the entry must be scoped to `[host]:port`, not the
   bare host (`ssh-keyscan -p <port> <host>` produces this automatically) —
   otherwise `StrictHostKeyChecking=yes` rejects the connection even with a
   correct key. Verify any freshly scanned key against the host's
   fingerprint out of band before trusting it, same as initial setup.
6. **Push a real tag (or re-run a workflow) and confirm the Actions job
   succeeds** using the new key — check the run logs to see which key
   authenticated, not just that the job is green. Since v1.2.10, an auth
   failure fails loud on the first attempt rather than retrying (see
   [The connection-refusal retry](#the-connection-refusal-retry)), so a
   misconfigured `authorized_keys` line for the new key shows up as an
   immediate failure.
7. **Once confirmed, remove the old key's line from `authorized_keys`.**
   Keep the new local private key (`chmod 600`), rather than deleting it, so
   you can re-run the `ssh -N` check from step 3 later without generating a
   fresh key each time. Delete only the `~/.ssh/authorized_keys.bak` from
   step 2, and only after a few days once you're sure you won't need to
   restore the old entry.
