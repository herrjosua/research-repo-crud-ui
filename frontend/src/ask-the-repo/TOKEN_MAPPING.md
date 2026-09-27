# Ask the Repo — token mapping (Direction B v2 → this app's real stack)

Ticket: "Ask the Repo — token/Carbon mapping for Direction B v2". Source
material: `docs/Build_Direction_B_v2_Design_decomposed/src/theme/tokens.ts`
(the `DARK`/`LIGHT` objects) and `.../data/mock/constants.ts` (`KIND_META`).
Real tokens read from `frontend/src/styles/_variables.scss` and the
`@carbon/*` packages under `frontend/node_modules` (versions per
`docs/design-tokens/README.md`, read 2026-09-26).

This file lives here (not under `docs/design-tokens/`) because `docs/` is
gitignored wholesale (`.gitignore:19`, commit `5a487ad`) except the
already-tracked `docs/deploy.md` — anything else placed there would never
actually get committed.

## Color: DARK/LIGHT → Carbon theme tokens

Every field below is a `theme.$x` SCSS variable (from
`@use '@carbon/react/scss/theme'`), which Carbon compiles to
`var(--cds-x, #fallback)` — confirmed by compiling a test snippet. That
means each of these resolves correctly in **both** themes automatically; no
theme-conditional code is needed per field.

| Direction B v2 field | Carbon token | Notes |
|---|---|---|
| `bg` | `theme.$background` | exact match, both themes |
| `surface` | `theme.$layer-01` | exact match, both themes |
| `surface2` | `theme.$layer-accent-01` | exact match, both themes |
| `border` | `theme.$border-subtle-00` | exact match, both themes |
| `borderSubtle` | *(no match — see below)* | |
| `textPrimary` | `theme.$text-primary` | exact match, both themes |
| `textSecondary` | `theme.$text-secondary` | exact match, both themes |
| `textMuted` | `theme.$text-helper` | exact in light (`#6f6f6f`); dark is `#8d8d8d` vs Carbon's `#a8a8a8` — one gray step off, no closer token exists |
| `textDisabled` | `theme.$text-disabled` | semantic match — Carbon expresses this as an alpha-modified color (25% over the base gray), not a flat hex, so it isn't a literal string match in either theme, but it is the correct token for this role |
| `aiRowBg` | `theme.$layer-01` | exact in light (duplicates `surface`); dark is `#1e1e1e` vs `#262626` — close, not exact |

**`borderSubtle` (`#2e2e2e` dark / `#e8e8e8` light) has no matching Carbon
border token in either theme.** Rather than inventing a token for it,
recommend collapsing `border`/`borderSubtle` into the single
`border-subtle-00` token — nothing in the reference implementation suggests
the two weights were load-bearing (they're only ever used for hairline
dividers), and `border` already maps exactly.

### Not theme-dependent (global palette, not `theme.$x`)

| Direction B v2 field | Carbon token |
|---|---|
| `teal`, `userBubble` | `teal-60` (`@carbon/colors`, `#007d79`) |
| `tealHover` | `teal-50` (dark) / `teal-70` (light) |
| `tealLight` | `teal-30` (dark) / `teal-70` (light) |
| `tealBg` | `teal-60` at 14% alpha (dark) / 8% alpha (light) |
| `userBubbleText` | `theme.$text-on-color` (white) |

**Flag, not a token gap:** light-theme `tealLight` (`#005d5d`) is byte-for-byte
identical to light-theme `tealHover`. Both resolve to `teal-70`. Given
`tealHover` and `tealLight` are visually distinct in the dark object (`teal-50`
vs `teal-30`), this reads like a Figma Make copy-paste rather than an
intentional reuse — worth confirming with design before carrying it forward.

## KindTag categorical colors (`KIND_META`, separate from DARK/LIGHT)

These aren't theme-dependent — they're a fixed 5-color source-type taxonomy.
The app already has a precedent for exactly this: `Dashboard.jsx` and
`RecordDetail.jsx` both render `<Tag type="blue">`/`<Tag type="gray">` for
categorical labels, so `<Tag>` (not a bespoke chip) is the right primitive.

| Kind | Direction B v2 hex | Carbon global color | Carbon `<Tag type>` |
|---|---|---|---|
| interview | `#0f62fe` | `blue-60` | `blue` |
| survey | `#8a3ffc` | `purple-60` | `purple` |
| doc | `#007d79` | `teal-60` | `teal` |
| synthesis | `#da1e28` | `red-60` | `red` |
| transcript | `#ff832b` | `orange-40` | **none — see below** |

**Gap: Carbon's `<Tag>` ships no `orange` type** (`red, magenta, purple,
blue, cyan, teal, green, gray, cool-gray, warm-gray, high-contrast, outline`
— confirmed against `Tag.d.ts` and `_tag.scss`). `KindTag.jsx` renders
`transcript` as `type="gray"` and `KindTag.module.scss`'s `.orange` class
layers the real `orange-40` global token (not an invented hex) on top via a
same-specificity, later-in-source-order override — the same `:global()`
pattern `RecordDetail.module.scss` already uses.

## Spacing

`docs/design-tokens/03-spacing.md` already documents the app's real spacing
scale (`@carbon/layout`, `spacing-01`…`13`) plus the two app-specific gap
constants in `_variables.scss`. Nothing in `KindTag` needed a new spacing
token — it uses Carbon's `<Tag size="sm">` padding/height as-is rather than
reproducing Direction B v2's `px-1.5 py-px` by hand, which is the more
faithful "translate to Carbon" move once the component is a real `<Tag>`
instead of a bespoke `<span>`.

## Dark/light mode

**Decision (2026-09-26): local-only for now, not a persisted user
preference.** Real accounts exist and could carry a `theme_preference`
field, but no theme toggle UI exists yet in this ticket or the app at large —
persisting a preference nobody can set yet is backend scope pulled forward
into a frontend/token ticket. Revisit persistence once a real toggle ships.

**Mechanism — no new SCSS needed.** `frontend/src/index.scss`'s existing
`@use '@carbon/react';` already compiles complete `.cds--g10` / `.cds--g90`
/ `.cds--g100` class blocks (verified by compiling it and finding all three
selectors in the output, each with a full `--cds-*` custom-property set).
Carbon ships this specifically so a theme can be applied by adding one class
to any element — it isn't tree-shaken by Vite since Sass compiles the whole
partial regardless of what the JS bundle imports.

That means: **every place already using `theme.$x` — including all three
`_variables.scss` re-exports and `KindTag` — re-themes correctly the moment
a `cds--g100` class lands on an ancestor element** (e.g. `<body>`). No
per-component migration is required. When the toggle ships in a later
ticket, it's `document.body.classList.toggle('cds--g100', prefersDark)` (or
equivalent) driven by `localStorage`, per the decision above.

**Pre-existing hardcoded colors that would silently break under `cds--g100`**
(found while auditing for this ticket; not fixed here — flagging per the
ticket's ask):

- `frontend/src/DemoUserPicker.module.scss:37` — `rgba(0, 0, 0, 0.05)` hover
  overlay → should be `theme.$background-hover`
- `frontend/src/DemoUserPicker.module.scss:50` — `#0f62fe` avatar background
  → should be `theme.$background-brand` (exact value match in white theme)
- `frontend/src/DemoUserPicker.module.scss:65` — `#525252` role text →
  should be `theme.$text-secondary` (exact value match)
- `frontend/src/RecordDetail.module.scss:4` — `#6f6f6f` placeholder text →
  should be `theme.$text-helper` (exact value match)

## Folder structure

New components live under `frontend/src/ask-the-repo/`, nested by concern
(chat / rails / insights / sources / context / mock), mirroring how the
Figma Make export was already decomposed
(`docs/Build_Direction_B_v2_Design_decomposed/DECOMPOSITION_NOTES.md`) rather
than the existing app's flat `src/*.jsx` convention — this feature is large
enough (~15+ files across a page shell, chat panel, two rails, and saved
insights) that flattening it into `src/` alongside `Dashboard.jsx` would be
unnavigable. Each component still follows the app's existing per-file
convention (`Name.jsx` + `Name.module.scss` + `Name.test.jsx`, default
export, CSS Modules via `@use './styles/variables'`).

Only `sources/` (this ticket's `KindTag`) exists so far. Planned shape for
the remaining 7 tickets:

```
frontend/src/ask-the-repo/
  AskTheRepo.jsx / .module.scss / .test.jsx   # page shell (mounts next to Dashboard)
  TOKEN_MAPPING.md                            # this file
  chat/
    ChatPanel.jsx / .module.scss
    ChatMessage.jsx / .module.scss
    AssistantMessage.jsx / .module.scss
  rails/
    LeftRail.jsx / .module.scss               # project/source navigation
    RightRail.jsx / .module.scss              # saved insights / context
  insights/
    SavedInsightsView.jsx / .module.scss
    InsightCard.jsx / .module.scss
  sources/
    SourceCard.jsx / .module.scss
    SourceDetailModal.jsx / .module.scss
    KindTag.jsx / .module.scss / .test.jsx    # built in this ticket
  context/
    AskSubViewContext.jsx
  mock/
    constants.js
    conversations.js
    starters.js
```

Deliberately **not** carried over from the reference: a `shared/ModalOverlay`
— this app already uses Carbon's own `<Modal>` directly (`Dashboard.jsx`,
`RecordDetail.jsx`), so `SourceDetailModal` should do the same rather than
reintroducing a custom overlay Carbon already provides.
