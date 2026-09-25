#!/usr/bin/env bash
#
# Forced command for the CI/CD deploy SSH key. Installed on the server as
# the `command=` in ~/.ssh/authorized_keys for a dedicated deploy key, e.g.:
#
#   command="/home/scripts/ssh-deploy-wrapper.sh",no-pty,no-agent-forwarding,no-X11-forwarding,no-port-forwarding,no-user-rc ssh-ed25519 AAAA... github-actions-deploy
#
# SSH runs this instead of whatever the client asked for, with the client's
# request (only) available in $SSH_ORIGINAL_COMMAND. This accepts exactly one
# shape, "deploy vX.Y.Z", and refuses everything else -- no shell is ever
# reachable through this key, regardless of what the client sends.
#
# Lives in the repo for review, but is installed BY HAND outside the app
# checkout (see docs/deploy.md): it must keep working no matter which tag is
# currently checked out, or being deployed, in ~/apps/research-repo-crud-ui.

set -Eeuo pipefail

APP_DIR=${DEPLOY_APP_DIR:-$HOME/apps/research-repo-crud-ui}
WRAPPER_LOG=${DEPLOY_WRAPPER_LOG:-$HOME/logs/deploy/ssh-wrapper.log}

log() {
    mkdir -p "$(dirname "$WRAPPER_LOG")" 2>/dev/null || true
    printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$WRAPPER_LOG" 2>/dev/null || true
}

if [[ -z ${SSH_ORIGINAL_COMMAND:-} ]]; then
    log "REFUSED: no command given (conn: ${SSH_CONNECTION:-unknown})"
    echo "No command given." >&2
    exit 1
fi

# Exactly "deploy vMAJOR.MINOR.PATCH", nothing before or after it. This regex
# must stay identical to deploy.sh's own tag check (see its main()).
if [[ ! $SSH_ORIGINAL_COMMAND =~ ^deploy\ (v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    log "REFUSED: '$SSH_ORIGINAL_COMMAND' (conn: ${SSH_CONNECTION:-unknown})"
    echo "Refused. Only 'deploy vMAJOR.MINOR.PATCH' is allowed through this key." >&2
    exit 1
fi

tag=${BASH_REMATCH[1]}
log "deploy $tag (conn: ${SSH_CONNECTION:-unknown})"

exec "$APP_DIR/scripts/deploy.sh" "$tag"
