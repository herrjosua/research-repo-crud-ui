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
change is accepted, UI Tests turns green on its own. A rejected change
(Deny in Chromatic) keeps UI Tests failing and the merge blocked until the
change is accepted or reverted. Because
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

## Storybook stories

A new component needs a Storybook story that renders it in every real
background context it appears in, not just the default canvas, so a
contrast regression shows up as a Chromatic change instead of being found
by hand later ([`frontend/CLAUDE.md`](./frontend/CLAUDE.md), rule 8). In
practice that means:

- **Every background it sits on.** Wrap the story in the component's real
  frame (the page's `$background`, a panel or modal's `$layer-01`, the
  rail) using a `*.stories.module.scss` next to the story.
- **Both themes.** If the component's colors depend on the theme, add a
  dark variant pinned with `globals: { theme: 'g100' }`, so Chromatic keeps
  a dark baseline as well as a light one.
- **Every state that changes its colors** (rule 7): hover, focus, active,
  selected and disabled, not just the resting state. Force the pseudo-states
  with `storybook-addon-pseudo-states`, the way the `Shared/Core/Button`
  and `Shared/Core/Link` stories do.

**Exception:** the dev-only provider toggle
(`frontend/src/ask-the-repo/dev/DevProviderToggle.jsx`) has no story on
purpose. It renders only in dev builds and must add no Chromatic baseline;
`DevProviderToggle.test.jsx` and CI's production-build check cover it
instead ([decision 14](./docs/decisions.md#14-a-dev-only-switch-between-static-and-live-answers)).

Every new story is a new Chromatic change, so it goes through the review
above before the pull request can merge. How to run Storybook, the theme
toolbar and the addons are in
[`frontend/README.md`](./frontend/README.md#storybook).
