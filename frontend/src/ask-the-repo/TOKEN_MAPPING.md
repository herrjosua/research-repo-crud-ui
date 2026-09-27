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
layers a real amber/peach global color plus solid black text on top via a
same-specificity, later-in-source-order override — the same `:global()`
pattern `RecordDetail.module.scss` already uses. `orange-40` (the table's
"Carbon global color" above) is the *categorical identity* color from
Direction B v2, not literally what renders: `orange-20` (a light,
amber/peach Carbon global color) paired with solid black text is what
actually ships — the same pair in both themes, chosen for guaranteed
contrast against every real background this chip renders on. See
`KindTag.module.scss`'s comment on `.orange` for why a solid background
replaced the original alpha-tinted `orange-40` background, and why a
single flat pair replaced an intermediate light/dark orange-text pair
(hand-tuning a second orange shade per theme, including a near-black
`orange-90` background that wasn't actually amber/peach anymore).

**Variable source**: `frontend/src/styles/_variables.scss`'s
`$kind-tag-orange-background`/`-text` — one flat pair, same in both
themes, like `$chat-accent` above — never hardcoded in
`KindTag.module.scss` itself, and never editing anything under
`@carbon/*`. Per the app-wide theming conventions (`frontend/CLAUDE.md`),
any future custom color that needs the same "no Carbon token fits"
treatment should follow this same variable-in-`_variables.scss` pattern
and get its own entry here.

**Verified contrast** (WCAG relative-luminance math against
`getComputedStyle()` values from a running instance, both themes, every
real background this chip renders against):

| Context | Backdrop | Contrast |
|---|---|---|
| White — rail default (`$background`) | `#ffffff` | 15.92:1 |
| White — rail hover (`$background-hover`) | `#f1f1f1` | 15.92:1 |
| White — rail selected (`$background-selected`) | `#e8e8e8` | 15.92:1 |
| White — chat citations (`$surface`) | `#f4f4f4` | 15.92:1 |
| G100 — rail default (`$background`) | `#161616` | 15.92:1 |
| G100 — rail hover (`$background-hover`) | `#292929` | 15.92:1 |
| G100 — rail selected (`$background-selected`) | `#333333` | 15.92:1 |
| G100 — chat citations (`$surface`) | `#262626` | 15.92:1 |
| Storybook Docs-page canvas (`.cds--g100` class present, real backdrop stays white — the case that broke the old alpha-tinted version) | `#ffffff` | 15.92:1 |
| White — sources rail card, default / hover / selected (Story 5; same `$background` + overlay tokens as the rail rows above) | `#ffffff` / `#f1f1f1` / `#e8e8e8` | 15.92:1 |
| White — source detail modal body (Story 5; Carbon `Modal` wraps its body in a `Layer`, measured resolving to `$layer-01` — the same value as `$surface` above) | `#f4f4f4` | 15.92:1 |
| G100 — sources rail card, default / hover / selected | `#161616` / `#292929` / `#333333` | 15.92:1 |
| G100 — source detail modal body | `#262626` | 15.92:1 |
| White — saved insight card (Story 6; Carbon `Tile`, measured resolving to `$layer-01` — same value as `$surface`) | `#f4f4f4` | 15.92:1 |
| G100 — saved insight card | `#262626` | 15.92:1 |

The number repeats everywhere, including across the theme toggle, because
both sides of the pairing are now solid *and* theme-independent: `#ffd9be`
background, `#000000` text, always — nothing in this table can shift it,
which is the whole point of moving off a themed orange text color. 15.92:1
comfortably clears not just the 4.5:1 AA minimum but the 7:1 AAA one.
Story 5's sources rail and detail modal were re-verified against their
real backgrounds (the four Story 5 rows above), and neither adds a new
backdrop: the card renders on the rail's `$background` with the same
hover/selected overlays as the left rail, and Carbon's `Modal` body
resolves to `$layer-01` (`$surface`). Both reconfirmed 15.92:1, and
KindTag needed no change.

Story 6's saved insight card (a Carbon `Tile` on the Saved Insights tab's
`$background`) likewise lands on `$layer-01` — the rows above — and needed
no new tokens: every color on the card and in the tab is an existing
`_variables.scss` re-export or a Carbon component default. Measured (white
/ g100, WCAG math on `getComputedStyle()`): card text 16.45 / 13.76 (title),
7.10 / 8.86 (content, save date); group labels and counts 7.81 / 10.59;
ghost "Show more"/"Show less" 4.55 / 6.43 at rest (Carbon's `$link-primary`
on `$layer-01` — passes, narrowly, in white) and 6.34 / 7.49 hovered; the
remove `IconButton`'s icon 16.45 / 13.76 at rest, 14.72 / 11.60 hovered.
Unlike the sources rail card (below), the insight card has no hover or
selected state of its own, so Carbon's ghost-button defaults sit on a plain
layer and don't need the `$text-secondary` override.

### Story 5 additions (Carbon tokens re-exported, not custom colors)

`_variables.scss` gained two plain Carbon re-exports — no custom values,
so nothing to add to the override table above — each with a comment on
where it's used:

- `$focus` → `theme.$focus`: focus ring for `SourceCard`'s stretched
  click overlay, which Carbon's own focus styles don't reach.
- `$border-strong` → `theme.$border-strong-01`: the rule beside the
  modal's cited excerpt (neutral, so it doesn't read as interactive blue
  or as the chat-identity teal).

One token *choice* is worth recording for reuse: on the sources rail
card, text on the hover/selected overlays uses `$text-secondary`, not
Carbon's interactive `$link-primary`. The card's pin toggle started as a
Carbon ghost `Button` (`$link-primary` text) and measured 5.00:1 on the
default card but **4.44:1 on hover and 4.09:1 on selected** (white theme),
under AA's 4.5:1. With `$text-secondary` at rest and `$text-primary` when
hovered or pinned, it measures (default / hover / selected):

| Theme | At rest | Pinned |
|---|---|---|
| White | 7.81 / 6.94 / 6.39 | 18.10 / — / 14.80 |
| G100 | 10.59 / 8.51 / 7.44 | 16.45 / — / 11.56 |

The same caution applies to Story 4's "Save as deliverable" saved state
(`$border-interactive` text) if it's ever reused on an overlay rather than
on `$surface`. The modal's own Carbon tertiary buttons sit on the plain
modal layer, so they keep Carbon's defaults: 4.55:1 at rest in white
(passes, narrowly), 6.38:1 hovered; 15.13 / 16.45:1 in g100.

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
(chat / rails / insights / sources / mock), mirroring how the
Figma Make export was already decomposed
(`docs/Build_Direction_B_v2_Design_decomposed/DECOMPOSITION_NOTES.md`) rather
than the existing app's flat `src/*.jsx` convention — this feature is large
enough (~15+ files across a page shell, chat panel, two rails, and saved
insights) that flattening it into `src/` alongside `Dashboard.jsx` would be
unnavigable. Each component still follows the app's existing per-file
convention (`Name.jsx` + `Name.module.scss` + `Name.test.jsx`, default
export, CSS Modules via `@use './styles/variables'`).

`sources/` (`KindTag`), `shell/` (`BreadcrumbBar`), `rails/` (project
switcher + conversation history), and now `chat/` (message list, composer,
assistant responses) all exist. Planned shape for the remaining tickets:

```
frontend/src/ask-the-repo/
  AskTheRepo.jsx / .module.scss / .test.jsx   # page shell (mounts next to Dashboard)
  TOKEN_MAPPING.md                            # this file
  shell/
    BreadcrumbBar.jsx / .module.scss          # breadcrumb sub-header, built in the page-shell ticket
  chat/
    ChatPanel.jsx / .module.scss / .test.jsx / .stories.jsx        # built in this ticket
    ChatMessage.jsx / .module.scss / .test.jsx / .stories.jsx      # built in this ticket
    AssistantMessage.jsx / .module.scss / .test.jsx / .stories.jsx # built in this ticket
    Composer.jsx / .module.scss / .test.jsx / .stories.jsx         # built in this ticket
    StarterQuestions.jsx / .module.scss / .test.jsx / .stories.jsx # built in this ticket
    useConversationMessages.js                # per-conversation message store, lifted out of ChatPanel in Story 5
  rails/
    LeftRail.jsx / .module.scss / .test.jsx / .stories.jsx         # built in the left-rail ticket
    ProjectSwitcher.jsx / .module.scss / .test.jsx / .stories.jsx  # built in the left-rail ticket
    ConversationList.jsx / .module.scss / .test.jsx / .stories.jsx # built in the left-rail ticket
  insights/
    SavedInsightsView.jsx / .module.scss / .test.jsx / .stories.jsx # the Saved Insights tab — built in Story 6
    InsightCard.jsx / .module.scss / .test.jsx / .stories.jsx       # built in Story 6
    useSavedInsights.js / .test.jsx           # session-only insights store, lifted to AskTheRepo.jsx — Story 6
  sources/
    SourcesPanel.jsx / .module.scss / .test.jsx / .stories.jsx      # the right rail — built in the sources-panel ticket (Story 5)
    SourceCard.jsx / .module.scss / .test.jsx / .stories.jsx        # built in Story 5
    SourceDetailModal.jsx / .module.scss / .test.jsx / .stories.jsx # built in Story 5
    KindTag.jsx / .module.scss / .test.jsx    # built in the token-mapping ticket
  mock/
    constants.js                              # PROJECTS — built in the left-rail ticket
    conversations.js                          # CONVERSATIONS — built in the left-rail ticket
    messages.js                               # INITIAL_MESSAGES_BY_CONVERSATION — built in Story 4; sources gained contextBefore/contextAfter in Story 5
    starters.js                               # STARTERS — built in this ticket
    insights.js                               # SAMPLE_INSIGHTS story/test fixtures — Story 6 (the real tab starts empty)
```

**Page-shell ticket note:** the reference `AppHeader.tsx`'s primary tab nav
(switching between "Research Records" and "Ask the Repo") and its dark/light
toggle button both live in the real app's *existing* `Header.jsx`/`App.jsx`,
not under `ask-the-repo/` — they're global app chrome (the theme toggle
re-themes `Dashboard` too), not Ask-the-Repo-specific content, even though
the reference bundles them into one `AppHeader` component. Likewise
`useTheme.js` (the localStorage + `prefers-color-scheme` hook backing that
toggle) lives at `frontend/src/useTheme.js`, alongside `Header.jsx`, not
under `ask-the-repo/`. Only the two top-level tabs (Ask / Saved Insights) and
the breadcrumb sub-header are Ask-the-Repo's own — the `AskSubViewNav`
reference component didn't get its own file, since Carbon's own `<Tabs>`
already manages selection state without a bespoke nav component or a
`AskSubViewContext`-style React Context (this app had no existing
tab/nav-with-Context convention to extend, and Carbon's `<Tabs>` needs only
local `useState` in `AskTheRepo.jsx`).

Deliberately **not** carried over from the reference: a `shared/ModalOverlay`
— this app already uses Carbon's own `<Modal>` directly (`Dashboard.jsx`,
`RecordDetail.jsx`), so `SourceDetailModal` should do the same rather than
reintroducing a custom overlay Carbon already provides.
