#!/usr/bin/env bash
#
# Exercises scripts/ssh-retry-classify.sh against the real production SSH
# wordings it has to tell apart: transient pre-auth transport failures
# (retry) versus real auth/host-key failures and anything that reached
# deploy.sh (fail loud).
#
#   scripts/tests/ssh-retry-classify.test.sh

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/scripts/ssh-retry-classify.sh"
PASSED=0
FAILED=0

check() {
    local desc=$1
    shift
    if "$@"; then
        PASSED=$((PASSED + 1))
        echo "  ok    $desc"
    else
        FAILED=$((FAILED + 1))
        echo "  FAIL  $desc"
    fi
}

# $1 = exit code, $2 = ssh output. Sets RC to the classifier's exit code.
classify() {
    "$SCRIPT" "$1" <<<"$2"
    RC=$?
}

expect_retry() {
    local desc=$1 exit_code=$2 output=$3
    classify "$exit_code" "$output"
    check "$desc" test "$RC" -eq 0
}

expect_no_retry() {
    local desc=$1 exit_code=$2 output=$3
    classify "$exit_code" "$output"
    check "$desc" test "$RC" -eq 1
}

main() {
    echo "Retry-worthy: pre-auth transport failures (exit 255)"
    expect_retry "kex-exchange banner refusal" 255 \
        'kex_exchange_identification: banner line 0: Not allowed at this time'
    expect_retry "connection closed by host:port (plain, no -v)" 255 \
        'ssh: connect to host example.com port 22: Connection closed by 203.0.113.5 port 54321'
    expect_retry "connection reset by host:port" 255 \
        'ssh: connect to host example.com port 22: Connection reset by 203.0.113.5 port 54321'
    expect_retry "plain TCP connection refused" 255 \
        'ssh: connect to host example.com port 22: Connection refused'
    expect_retry "verbose connection-closed wording" 255 \
        'Connection closed by remote host'

    echo "Fail loud: real auth/host-key failures (also exit 255)"
    expect_no_retry "permission denied (publickey)" 255 \
        'user@example.com: Permission denied (publickey).'
    expect_no_retry "host key verification failed" 255 \
        'Host key verification failed.'
    expect_no_retry "unrelated resolution failure" 255 \
        'ssh: Could not resolve hostname example.com: Name or service not known'

    echo "Fail loud: deploy.sh itself ran (exit codes 0-3), never retried"
    expect_no_retry "deploy.sh failed and rolled back (1), even with retry-looking text" 1 \
        'Connection reset by 203.0.113.5 port 54321'
    expect_no_retry "deploy.sh needs a human (2)" 2 \
        'ERROR: rollback itself failed'
    expect_no_retry "deploy.sh refused before changing anything (3)" 3 \
        'ERROR: Another deploy is running'
    expect_no_retry "deploy.sh succeeded (0)" 0 \
        'Deployed v1.2.10.'

    echo
    echo "$PASSED passed, $FAILED failed"
    ((FAILED == 0))
}

main "$@"
