# Research Repo CRUD UI — Frontend

React app for the CRUD UI. v0.9 (Auth + Browse) and v1.0 (Create/Edit/Delete)
are both complete: login, session persistence, logout, a filterable
dashboard, and full create/edit/delete with a WYSIWYG content editor and
edit history. v1.1 (Deploy + Polish) is next.

**Stack:** Vite + React, [Carbon Design System](https://carbondesignsystem.com/)
for components, [TanStack Query](https://tanstack.com/query) for data
fetching/caching, [CKEditor 5](https://ckeditor.com/) for WYSIWYG markdown
editing.

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
├── vite.config.js         Dev server + /api proxy to the backend
├── src/
│   ├── api/
│   │   ├── client.js       Shared fetch wrapper — credentials included, JSON in/out, error handling
│   │   ├── auth.js         useLogin, useLogout, useSignup (hook, no screen yet), useMe
│   │   └── records.js      useRecords, useRecord, useCreateSession, useUpdateRecord,
│   │                       useDeleteRecord, useRecordHistory
│   ├── styles/
│   │   └── _variables.scss Shared Sass tokens (spacing, header height)
│   ├── App.jsx              Top-level: session gate (login vs. dashboard), header
│   ├── App.module.scss
│   ├── Header.jsx           Carbon Header + logout action
│   ├── LoginForm.jsx         Carbon Form, wired to useLogin
│   ├── Dashboard.jsx         Kind + tag filtering, record list, "New session" button, opens RecordDetail
│   ├── Dashboard.module.scss
│   ├── CreateSessionForm.jsx  Structured fields + CKEditor content, posts to POST /sessions
│   ├── EditRecordForm.jsx     Frontmatter fields + CKEditor content, posts to PUT
│   ├── RecordDetail.jsx      Read view, Edit toggle, Delete confirmation, history panel
│   ├── RecordDetail.module.scss
│   ├── index.scss           `@use '@carbon/react';` — Carbon's base styles
│   └── main.jsx             React Query's QueryClientProvider
```

## Still to build

**v1.1 (Deploy + Polish):**
- Responsive layout (currently desktop-oriented — intentionally deferred)
- A signup screen (`useSignup()` exists in `api/auth.js`, unused so far) —
  and per the current plan, likely stays unused: v1.1 calls for *closed*
  signup + seeded demo accounts for the public/portfolio deploy, not open
  self-registration
- Deploy target: leaning AWS free tier or the existing webhost, both free
- Security hardening (path validation on slugs, HTTPS, rate limiting beyond
  `/login`, a demo-data-reset cron) — see the Notion roadmap for the full
  checklist

See the Version Milestone Roadmap in Notion for full detail and decision
rationale, including three real bugs found and fixed during v1.0 (a silent
git-commit-loss bug, a `build_index.py` crash, and its root cause in how
`gray-matter` handles frontmatter dates).
