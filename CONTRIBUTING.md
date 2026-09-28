# Contributing

## Visual review (Chromatic)

The Chromatic project is linked to this GitHub repository, so Chromatic
posts two checks of its own on every pull request, separate from the CI
workflow:

- **UI Tests**: a required check in the `main-protection` ruleset. It stays
  pending while any visual or accessibility change in the build is
  unaccepted, new stories included, so the PR can't merge until every
  change has been reviewed.
- **Storybook Publish**: reports the published Storybook. Not required.

The `chromatic` job in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
builds the frontend's Storybook and publishes it to Chromatic. It is not the
merge gate; UI Tests is.

This is a solo project, so the repository owner is the only reviewer:
open the pull request's Chromatic build and accept or reject each change
there (Chromatic's separate UI Review feature isn't used). Once every
change is accepted, UI Tests turns green on its own. Because
"Require branches to be up to date before merging" is on, if `main` moves
after you accept, GitHub asks you to update the branch, which starts a new
Chromatic build.

**Accept** a change when it's what the PR set out to do: a new component or
story, or a deliberate style or token change showing up where it should.
**Reject** a change on any component the PR didn't mean to touch — that's
a real regression, even if it looks harmless. Fix the underlying change,
push, and review the new build; never accept a regression just to unblock
the PR, since it becomes the baseline every later PR is compared against.

If UI Tests stops posting on pull requests, check that the Chromatic
project is still linked to this repository.
