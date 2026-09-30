# Research Repo CRUD UI — Frontend

React app for the CRUD UI. v0.9 (Auth + Browse) and v1.0 (Create/Edit/Delete)
are both complete: login, session persistence, logout, a filterable
dashboard, and full create/edit/delete with a WYSIWYG content editor and
edit history. v1.1 (Testing) and v1.2 (Deploy + Polish) are also complete —
see [v1.2 (Deploy + Polish)](#v12-deploy--polish) below.

**Stack:** Vite + React, [Carbon Design System](https://carbondesignsystem.com/)
for components, [TanStack Query](https://tanstack.com/query) for data
fetching/caching, [CKEditor 5](https://ckeditor.com/) for WYSIWYG markdown
editing, [Vitest](https://vitest.dev/) + [React Testing
Library](https://testing-library.com/docs/react-testing-library/intro/) for
component tests.

## Setup

Requires the backend running first (see [`../backend/README.md`](../backend/README.md))
— this app proxies all `/api/*` requests to it.

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173` by default. The Vite dev server proxies
`/api` to `http://localhost:3001` (configured in `vite.config.js`), so
session cookies work correctly across the frontend/backend origin split in
dev without needing CORS config on the Express side.

To run Storybook (`http://localhost:6006`) alongside the dev server, use
`npm run dev:all` instead: it starts both with output prefixed `[dev]` /
`[storybook]`, and Ctrl+C stops both.

Ask the Repo's local Ollama setup is backend-only — see
[`../backend/README.md`](../backend/README.md#ask-the-repo-local-ollama).

**Dev-only provider toggle.** With the backend started with
`DEV_TOOLS_ENABLED=true` (and `NODE_ENV=development`), the Ask page shows a
"Dev" toggle at the right of its breadcrumb bar that switches Ask the Repo
between static and live (Ollama) answers without restarting the backend
([details](../backend/README.md#switching-providers-without-a-restart-dev-only)).
It's loaded only under `import.meta.env.DEV` (`src/ask-the-repo/AskTheRepo.jsx`),
so `npm run build` leaves it out entirely; CI fails the build if its endpoint
path or label shows up in `dist/`. Against a backend without dev tools it
renders nothing. It has no Storybook story, so it has no Chromatic baseline.

## Testing

```bash
npm test         # single run (vitest run)
npm run test:watch   # watch mode
```

The `frontend` job in
[`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the source
of truth for what actually runs in CI. Current test files:

- **`LoginForm`**: successful login (calls `onLoginSuccess`), a failed login
  showing the server's actual error message, and the pending state (button
  disabled and reads "Logging in…" while the request is in flight).
- **`DemoUserPicker`**: a profile button per demo user, disclaimer/heading
  ordering, calling `demoLogin.mutate` with the selected username, disabling
  every button while pending, and the error-notification and
  no-demo-users-yet states — the demo-mode counterpart to `LoginForm`.
- **`Dashboard`**: kind/tag filtering logic (including combined filters and
  the "no matching records" empty state), plus loading and error states.
- **`App`**: whether `LoginForm` or `DemoUserPicker` renders for a given
  `useMe`/`useDemoUsers` result, and exactly when `DemoDisclaimer` shows
  (above the dashboard once logged in, never on the login/picker screen
  itself, and never as an announced live region).
- **`CreateSessionForm`** and **`EditRecordForm`**: the researcher/designer
  attribution field — auto-filled and disabled for a non-lead, a
  reassignment dropdown for a lead, and (`EditRecordForm` only) that a
  record kind with no attribution field shows none.
- **`RecordDetail`**: that a save warning from the backend displays and
  refocuses Edit, a clean save shows none, and a read-only record (e.g. a
  component generated from Figma) hides Edit/Delete, points to where the
  real edit should happen instead, and keeps View history available.

Tests mock `fetch` directly (via `client.js`'s use of the global `fetch`)
rather than mocking the API hooks themselves for `LoginForm`, since that
exercises the real React Query mutation lifecycle (`isPending`/`isError`)
end to end. `Dashboard`'s tests mock `useRecords` directly instead, since its
filtering logic is synchronous client-side `useMemo` work with no async
round-trip worth simulating.

`vitest.setup.js` loads `@testing-library/jest-dom`'s matchers (e.g.
`toBeInTheDocument()`); the `test` block in `vite.config.js` configures the
`jsdom` environment Vitest needs to render real DOM output in tests.

Real browser end-to-end tests and automated WCAG 2 AA accessibility scans
(Playwright + `@axe-core/playwright`) live in the separate top-level
[`../e2e/`](../e2e/README.md) folder, since they drive this app and the
backend together rather than testing either in isolation.

## Storybook

```bash
npm run storybook          # dev server at http://localhost:6006
npm run build-storybook    # static build into storybook-static/ (gitignored)
```

`npm run dev:all` runs it next to the app dev server (see [Setup](#setup)).
Config lives in `.storybook/` in this folder: `main.js` picks up every
`src/**/*.stories.@(js|jsx)` file and reuses `vite.config.js`'s `resolve`
and `define`, so components resolve the same way they do under `vite dev`;
`preview.js` loads the same `src/index.scss` the app does.

Storybook is where a component's visual states and every background it
renders on get checked, in both themes, without a backend. Stories sit next
to their component, and a `*.stories.module.scss` beside a story supplies
the real frame or background the component sits in inside the app (the
rail, the chat column, a modal's `$layer-01`). The sidebar has three
groups:

- **Shared/Core**: components every feature renders — Carbon's own
  `Button` (every kind the app uses × default/hover/focus/active/disabled,
  on the page and in a modal or panel), links in each context they appear,
  `DemoDisclaimer`, and `BreadcrumbBar`.
- **Records**: `RecordKindTag`, `RecordsRail` and `EditRecordForm`, each
  with dark-theme variants, and `RecordsRail` also at the `md` floor width.
- **Ask the Repo**: the chat, rails, sources and saved-insights components,
  with a story per meaningful state — for example `ChatPanel`'s loading,
  unavailable, model-error, session-expired and static-mode states,
  `SourcesPanel` at the `md` floor width, and `KindTag` and `SourceCard`
  rendered against every background they appear on.

**Themes.** The toolbar's **Theme** control switches between White and
G100 (dark). It toggles the `cds--g100` class on `<body>`, the same class
the header's theme toggle sets through `src/useTheme.js`, so a story
re-themes exactly the way the app does (see
[`TOKEN_MAPPING.md`](./src/ask-the-repo/TOKEN_MAPPING.md#darklight-mode)).
Storybook remembers the toolbar choice itself; `useTheme`'s `localStorage`
key isn't involved. A story pinned to dark with
`globals: { theme: 'g100' }` (the `…Dark` stories) is snapshotted in dark
regardless of the toolbar. On a Docs page the class still lands on
`<body>`, but the canvas backdrop stays white.

**Addons:**

- **`@storybook/addon-docs`**: every story gets an autodocs page with a
  props table by default (`tags: ['autodocs']` in `preview.js`); opt a
  story out with `tags: ['!autodocs']`.
- **`@storybook/addon-a11y`**: runs an axe scan on each story in the
  Accessibility panel, in whichever theme is selected. Chromatic runs the
  same kind of check on every build, which is how the ghost button's
  pressed-state contrast failure was found (see
  [`TOKEN_MAPPING.md`](./src/ask-the-repo/TOKEN_MAPPING.md#links-decision-2026-09-28)).
- **`storybook-addon-pseudo-states`**: forces `:hover`, `:focus` and
  `:active` on specific elements through a story's `pseudo` parameter, so
  Chromatic snapshots those states and not just the resting one. The
  `Shared/Core/Button` and `Shared/Core/Link` stories use it.

Controls, Actions and Interactions come with the `storybook` package itself
in v10, so they need no addon.

**Chromatic.** Storybook is what Chromatic snapshots: the `chromatic` job in
[`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs
`build-storybook` and publishes the result on every push and pull request.
Every story, including each dark variant, is a baseline that later changes
are compared against. How changes are reviewed, what gates the merge, and
which components need a story are in
[`../CONTRIBUTING.md`](../CONTRIBUTING.md#storybook-stories).

## Why Carbon, not Tailwind

The project started with Tailwind, then switched to Carbon mid-setup.
Accessibility is one of Carbon's core design principles — its components
ship already meeting WCAG 2.1 AA out of the box. This paid off directly: the
initial record list used a plain `Tile` with an `onClick` handler, which
turned out to be completely invisible to keyboard users (Tab skipped over
every result). Swapping to Carbon's `ClickableTile` — natively focusable and
Enter-operable — fixed it immediately, no custom ARIA/keyboard code needed.
Carbon's `Modal` similarly handles focus trapping, focus-on-open, and
Escape-to-close automatically — including the confirmation dialog and
history panel added in v1.0 (both portal-rendered via `createPortal` into
`document.body`, since nesting one Carbon `Modal` directly inside another
breaks its positioning otherwise).

Carbon's WCAG compliance isn't a substitute for actually testing the app's
specific composition of its components, though — an automated accessibility
scan (see [`../e2e/README.md`](../e2e/README.md)) found three real issues:
two in this app's own markup (a missing page-level `<h1>`, and a skipped
heading level), and one in Carbon's `Modal` itself (its focus-trap "sentinel"
elements failing a landmark-region check), which Carbon has already
addressed via an opt-in feature flag,
`enable-experimental-focus-wrap-without-sentinels`, enabled globally in
`main.jsx`.

## WYSIWYG editing: CKEditor 5, chosen deliberately

v1.0 needed a way to edit a record's actual markdown body, not just its
frontmatter fields. This is one of the few places "cleanest UX" and "best
accessibility" genuinely pull in different directions, so it's worth
explaining the reasoning rather than just naming the library:

A true WYSIWYG editor (rendering **bold**/headings/lists inline as you type,
no raw `**`/`#` symbols visible) is built on `contentEditable` — a browser
feature with real, industry-wide known accessibility limitations for screen
reader users. This isn't a library-specific flaw; it's an inherent property
of how rich-text editing works in browsers today. A markdown-plus-live-preview
approach (a real `<textarea>` with a rendered preview alongside it) avoids
that tradeoff entirely, at the cost of a less polished editing feel.

**CKEditor 5** was chosen over both a lightweight React-native WYSIWYG
library and the safer textarea approach because it's one of the few editors
with genuine enterprise/government accessibility investment — published
VPATs, real ARIA-compliant toolbars — the same class of tool that lets
federal/government sites actually use WYSIWYG editing and still pass 508
review. Most lightweight React-native rich-text libraries have no comparable
track record, despite sometimes claiming to be "accessible."

Setup notes:
- Single npm package, `ckeditor5` (their newer consolidated packaging — the
  `Markdown` data-processor plugin is bundled in, not a separate install)
  plus `@ckeditor/ckeditor5-react` for the React wrapper.
- `licenseKey: 'GPL'` in the editor config enables free/open-source use.
- The `Markdown` plugin makes `.getData()` return real markdown text (not
  HTML), matching the backend's `content` field exactly — no format
  conversion needed anywhere in this app.
- Plugin list (`Essentials, Paragraph, Heading, Bold, Italic, Code, Link,
  List, BlockQuote, Markdown`) is deliberately scoped to exactly what the
  agentic-repo's `md_render.py` can render back out — no point exposing
  formatting the renderer can't handle on the way back.

## Data fetching pattern: lazy loading

`GET /api/records` returns every record's full content (including rendered
HTML) by default — fine for a handful of records, wasteful for a list view
showing dozens. The backend's `export_records.py` got a `--summary` flag
(strips `html`/`searchText`) threaded through as `?summary=true`; the
dashboard's list view uses that, and a separate `useRecord(id)` hook fetches
one record's full content only when it's actually opened, via React Query's
per-id caching (`queryKey: ['record', id]`) so re-opening the same record
doesn't re-fetch it. Editing needs one step further — `useUpdateRecord` and
the Edit form use the record's `rawContent` field (real markdown source,
added to the backend specifically for this), not the rendered `html`.

## Rendering record content safely

`RecordDetail.jsx`'s read-only view renders each record's pre-rendered HTML
body via `dangerouslySetInnerHTML`. This is safe specifically because that
HTML is generated at build time by the agentic-repo's own Python pipeline
(`build_search_ui.py`'s markdown renderer) from files this app itself
writes — never from arbitrary or third-party input. The same trust boundary
`research/search.html` already relies on. Before injecting it, the HTML runs
through `cleanRecordHtml()`, which uses real DOM parsing (`DOMParser`,
`TreeWalker`) rather than string/regex replacement — an early attempt used a
naive regex swap of literal "TODO" placeholder text and ended up corrupting
a real link's `href` attribute, since regex has no concept of "inside a tag"
vs. "visible text." `cleanRecordHtml()` handles: removing the redundant
duplicate `<h1>` title, shifting heading levels so content never outranks
the modal's own heading, turning unfilled template placeholders into a
consistent "Not yet filled in" style, collapsing unfilled scaffolding
(Key Findings, Roles) to one clean line instead of showing raw template
syntax, stripping broken/unfilled relation links, and removing any section
whose heading ends up with nothing under it once its content is cleaned.

## Project structure

```
frontend/
├── vite.config.js         Dev server + /api proxy to the backend; also configures the Vitest test environment
├── vitest.setup.js         Loads @testing-library/jest-dom matchers for all test files
├── src/
│   ├── api/
│   │   ├── client.js       Shared fetch wrapper — credentials included, JSON in/out, error handling
│   │   ├── client.test.js
│   │   ├── auth.js         useLogin, useLogout, useSignup (hook, no screen yet), useMe,
│   │   │                   useDemoUsers, useDemoLogin, useUsers (the lead-reassignment list)
│   │   ├── ask.js          useAskConfig (GET /api/ask/config), askRepo (POST /api/ask)
│   │   ├── dev.js          useDevProvider, useSetDevProvider: the dev-only provider toggle's calls
│   │   ├── dev.test.jsx
│   │   └── records.js      useRecords, useRecord, useCreateSession, useUpdateRecord,
│   │                       useDeleteRecord, useRecordHistory
│   ├── ask-the-repo/       The Ask the Repo page. Most components below also have a
│   │   │                   .module.scss, a .stories.jsx and a .test.jsx beside them.
│   │   ├── AskTheRepo.jsx  The page: left rail, chat panel, sources rail, Saved Insights tab;
│   │   │                   loads the dev-only toggle in dev builds only
│   │   ├── TOKEN_MAPPING.md  How the design's tokens map to Carbon
│   │   ├── chat/           ChatPanel, ChatMessage, AssistantMessage, Composer,
│   │   │                   QuestionPicker (static mode), StarterQuestions; useAskRepo
│   │   │                   (the ask flow), askCopy.js (request-state wording), starters.js
│   │   ├── dev/            DevProviderToggle (dev only, no story), devProviderCopy.js
│   │   ├── fixtures/       Story and test data only
│   │   ├── insights/       SavedInsightsView, InsightCard, useSavedInsights (page state only)
│   │   ├── rails/          LeftRail, ProjectSwitcher, ConversationList
│   │   ├── shell/          BreadcrumbBar (shared by both pages)
│   │   └── sources/        SourcesPanel, SourceCard, SourceDetailModal, KindTag, kindMeta.js
│   ├── styles/
│   │   └── _variables.scss Shared Sass tokens (spacing, header height)
│   ├── App.jsx              Top-level: session gate (login/picker vs. dashboard), demo disclaimer, header
│   ├── App.module.scss
│   ├── App.test.jsx          Which screen renders per demo-user state, and demo disclaimer visibility
│   ├── Header.jsx           Carbon Header + logout action
│   ├── LoginForm.jsx         Carbon Form, wired to useLogin
│   ├── LoginForm.test.jsx    Success, error, and pending-state tests
│   ├── DemoUserPicker.jsx      Passwordless login: one button per seeded demo profile, shown instead of LoginForm when DEMO_MODE is on
│   ├── DemoUserPicker.module.scss
│   ├── DemoUserPicker.test.jsx Profile buttons, pending/error states, demo-login call
│   ├── DemoDisclaimer.jsx      Permanent "Demonstration environment" notice (Callout, not a live region) — shown on the picker and above the dashboard
│   ├── DemoDisclaimer.module.scss
│   ├── Dashboard.jsx         Kind + tag filtering, record list (h1 page title, h2 per record), "New session" button, opens RecordDetail
│   ├── Dashboard.module.scss
│   ├── Dashboard.test.jsx    Kind/tag filtering, empty state, loading/error state tests
│   ├── CreateSessionForm.jsx  Structured fields + CKEditor content, posts to POST /sessions
│   ├── CreateSessionForm.test.jsx  Researcher-attribution field: auto-fill, disable, reassignment
│   ├── EditRecordForm.jsx     Frontmatter fields + CKEditor content, posts to PUT
│   ├── EditRecordForm.test.jsx     Attribution field + save-warning passthrough
│   ├── RecordDetail.jsx      Read view, Edit toggle, Delete confirmation, history panel
│   ├── RecordDetail.module.scss
│   ├── RecordDetail.test.jsx  Save-warning display and read-only (generated) record handling
│   ├── index.scss           `@use '@carbon/react';` — Carbon's base styles
│   └── main.jsx             React Query's QueryClientProvider, wrapped in Carbon's FeatureFlags (enable-experimental-focus-wrap-without-sentinels)
```

## v1.2 (Deploy + Polish)

Shipped. What changed for the frontend:

- **Responsive layout**, scoped to Carbon's `md` breakpoint and up
  (672–1055px), tested at both edges by
  [`../e2e/tests/responsive.spec.js`](../e2e/tests/responsive.spec.js).
  Phone-size (`sm`, below 672px) is deliberately out of scope — this is a
  tool used on laptops and tablets, not a phone app.
- **Demo mode UI**: `DemoUserPicker.jsx` (passwordless login as one of three
  seeded profiles) shows instead of `LoginForm` when the backend has
  `DEMO_MODE=true`, and `DemoDisclaimer.jsx` — a permanent "Demonstration
  environment" notice, not a dismissible or announced one — shows on the
  picker and above the dashboard.
- **Deploy**: live at `https://ux-research.joshuabock.com`, one Node
  process serving both the API and this app's build (see
  [`../docs/deploy.md`](../docs/deploy.md) for the full runbook).
- **Security hardening**: covered in
  [`../backend/README.md`](../backend/README.md)'s Security notes — path
  validation, `helmet` headers, `robots.txt`, rate limiting, and HTTPS
  (terminated at the edge proxy in front of the host, configured outside
  this repo) are all live, not just prepped.
- **Signup screen**: still not built. `useSignup()` exists in `api/auth.js`
  but has no screen — the public deploy uses closed signup with seeded demo
  accounts instead (see the root README's [Demo mode](../README.md#demo-mode)).

v1.3 is in progress (its Ask the Repo was released as v1.3.6), and v1.4
(Storybook and Chromatic, see [Storybook](#storybook)) has shipped. Their
status and what's still planned are in the root README's
[Roadmap](../README.md#roadmap). v1.0 also found and fixed three real bugs:
a silent git-commit-loss bug, a `build_index.py` crash, and its root cause
in how `gray-matter` handles frontmatter dates.
