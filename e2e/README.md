# Research Repo CRUD UI — End-to-End + Accessibility Tests

Playwright + `@axe-core/playwright` tests that drive a real browser against
the actual running frontend and backend together — not either app tested in
isolation, but the whole integrated system a real user would experience.

**Stack:** [Playwright](https://playwright.dev/) for browser automation,
[`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
for automated WCAG 2 AA accessibility scanning.

## Setup

```bash
cd e2e
npm install
npx playwright install   # downloads the actual browser binaries — one-time, not a package
```

## Running the tests

**Stop any backend dev server you have running in another terminal tab
first.** `playwright.config.js` starts its own backend instance in
`NODE_ENV=test` mode — the same test/prod database branching the Jest suite
uses (`app.test.<workerId>.db` instead of the real `app.db`) — and is
deliberately configured *not* to reuse an already-running backend
(`reuseExistingServer: false`), so that a real dev-mode server left running
on port 3001 causes a loud startup error instead of silently getting reused
and receiving real signup/session writes. The frontend dev server is safe to
reuse, since it never writes data itself.

```bash
npm test
```

Playwright starts both apps itself (per the config above) if they aren't
already running, waits for them to be ready, then runs the test files in
`tests/`.

## What's covered

- **`login-browse-logout.spec.js`** — the core flow: a test user is created
  by calling `POST /api/auth/signup` directly (there's no signup screen in
  the UI yet — `useSignup()` exists in the frontend's `api/auth.js` but isn't
  wired up), then a real login through the actual `LoginForm` UI, confirming
  the dashboard renders, an accessibility scan of the logged-in dashboard,
  and a real logout back to the login screen.
- **`keyboard-access.spec.js`** — the same flow, but entirely via keyboard
  (`Tab`/`Enter`/`Escape`, no mouse clicks at all): logging in, opening a
  record's detail modal, opening the nested delete-confirmation dialog on
  top of it, and confirming `Escape` closes them one at a time rather than
  both at once. Includes accessibility scans of both modal states, which the
  first test never reaches.

- **`responsive.spec.js`** — the same real-login flow at Carbon's md
  breakpoint range (`setViewportSize` to 672px, the floor, and 1055px, the last
  pixel before lg; phone-size is deliberately out of scope). Asserts the
  dashboard has no horizontal overflow, the tag sidebar stays inside its column
  and clear of the main column and the fixed footer, and that the record
  detail, delete-confirmation, and create-session modals (plus both CKEditor
  toolbars) stay inside the viewport with every action button genuinely
  clickable — via Playwright trial clicks, which fail if another element would
  intercept the click. Includes accessibility scans of the dashboard, detail
  modal, and delete confirmation at md width. Scans run before each step's
  trial clicks because a hovering pointer makes axe read Carbon's
  mid-transition button colors and report a bogus, run-to-run-varying contrast
  failure.

Each test uses a unique, timestamped test username (`e2e-tester-<timestamp>`)
rather than a fixed one, since the test-mode database persists across
separate `npm test` runs (there's no per-run isolation the way Jest's
`JEST_WORKER_ID` scoping provides) — a fixed username would eventually hit a
stale `409` on signup.

## Real accessibility issues found and fixed

Writing these tests surfaced three genuine WCAG 2 AA issues that had gone
unnoticed until an automated scan actually ran against the real rendered
app — none were hypothetical or contrived to demonstrate the tooling:

1. **No `<h1>` anywhere on the page** (`page-has-heading-one`) — the app
   went straight from Carbon's `Header` (a link, not a heading) to `<h3>` on
   each record tile, with no page-level heading at all. Fixed by adding a
   real, visible `<h1>Research Records</h1>` to `Dashboard.jsx`.
2. **Skipped heading level** (`heading-order`) — with the new `<h1>` in
   place, record tiles still used `<h3>`, skipping `<h2>` entirely. Fixed by
   changing the tile heading to `<h2>`, since there's no intermediate
   section heading between the page title and the record list that would
   justify the skip.
3. **Carbon's own modal focus-trap implementation failed the `region` rule**
   — Carbon's `Modal` inserts hidden "focus sentinel" spans
   (`cds--visually-hidden`) to wrap keyboard focus at the start/end of a
   modal's content, and axe's `region` rule flags them as page content not
   contained in a landmark. This is a known Carbon issue with an
   already-shipped fix: the `enable-experimental-focus-wrap-without-sentinels`
   feature flag (documented at
   [carbondesignsystem.com/components/modal/code](https://carbondesignsystem.com/components/modal/code/)),
   which removes the sentinel nodes from the DOM entirely in favor of
   tracking tab order among the modal's actual interactive children. Per
   Carbon's docs, this becomes the default behavior in their next major
   version (v12). Enabled globally in `frontend/src/main.jsx` via a
   `<FeatureFlags>` wrapper around the whole app.
