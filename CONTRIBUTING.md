# Contributing

## Visual review (Chromatic)

Every pull request to `main` runs the `chromatic` job in
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml): it builds the
frontend's Storybook, publishes it to Chromatic, and diffs every story's
snapshot against the last-approved baseline. The job fails while any
snapshot has an unreviewed or denied change, and `chromatic` is a required
check in the `main-protection` ruleset — so a PR can't merge until every
flagged diff is either accepted or reverted.

This is a solo project, so Josh is the only reviewer: open the Chromatic
build from the `chromatic` job's log and accept or deny each change in
Chromatic's review UI. Accepting doesn't re-run the check — re-run the
`chromatic` job afterwards, and since accepted snapshots are the branch's
new baseline, it passes.

**Accept** a diff when it's the change the PR set out to make: a new
component or story, or a deliberate style or token change showing up where
it should. **Deny** a diff on any component the PR didn't mean to touch —
that's a real regression, even if it looks harmless. Fix the underlying
change, push, and review the new build; don't accept a regression just to
unblock the PR, since it becomes the baseline every later PR is compared
against.
