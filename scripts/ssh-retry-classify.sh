#!/usr/bin/env bash
#
# Classifies one SSH connection attempt from .github/workflows/deploy.yml's
# deploy step: is this a transient transport failure worth retrying, or
# should the workflow fail loud?
#
#   scripts/ssh-retry-classify.sh <exit_code>   # ssh's output piped in on stdin
#
# Exit 0: retry (a pre-auth transport failure).
# Exit 1: fail loud (a real auth/host-key problem, or deploy.sh already ran).
#
# Retries ONLY a pre-auth transport failure (SSH exit 255) matching one of
# the failure modes we've actually seen or could see on this shared host:
# the connection-slot refusal (confirmed by host support: server out of
# connection slots, not IP/account based) - which OpenSSH words differently
# depending on verbosity: "Connection closed by remote host" in verbose (-v)
# output, or "Connection closed by <host> port <port>" / "Connection reset by
# <host> port <port>" in the plain output this step actually produces (no
# -v) - the kex-exchange banner refusal, or a plain TCP-level "Connection
# refused". All are transport-layer failures before deploy.sh ever runs, so
# all are safe to retry the same way. A real auth failure or host-key
# mismatch is also exit 255 but won't match this text, so it fails loud on
# attempt 1 rather than retrying something un-retryable. Anything that
# reached deploy.sh (0-3) is NEVER retried here: retrying a completed deploy
# attempt could stack a second deploy on top of a live rollback.
#
# One thing this text match can't tell apart: "Connection closed/reset by
# ... port ..." can also happen mid-session, AFTER deploy.sh has already
# started on the server - ssh can't say when in the session the drop
# happened, so the wording is identical either way. deploy.sh's own flock
# (see preflight()) makes a resulting retry safe rather than racy: a second
# concurrent run is refused, not stacked on top of the first. It does mean a
# retry after a mid-session drop can end the workflow run with a misleading
# "refused, nothing changed" while the first attempt's deploy.sh keeps
# running to completion in the background - it ignores SIGHUP (see
# deploy.sh's `trap '' HUP`) precisely so a dropped connection doesn't kill a
# deploy partway through. That's a confusing job result, not a
# double-deploy risk.

set -euo pipefail

exit_code=${1:?usage: ssh-retry-classify.sh <exit_code> (SSH output on stdin)}
ssh_output=$(cat)

[[ $exit_code -eq 255 ]] && grep -qE \
    'Connection closed by remote host|Connection closed by [^ ]+ port [0-9]+|Connection reset by [^ ]+ port [0-9]+|kex_exchange_identification|Not allowed at this time|Connection refused' \
    <<<"$ssh_output"
