# Ask the Repo — token mapping (Direction B v2 → this app's real stack)

Ticket: "Ask the Repo — token/Carbon mapping for Direction B v2". Source
material: `docs/Build_Direction_B_v2_Design_decomposed/src/theme/tokens.ts`
(the `DARK`/`LIGHT` objects) and `.../data/mock/constants.ts` (`KIND_META`).
Real tokens read from `frontend/src/styles/_variables.scss` and the
`@carbon/*` packages under `frontend/node_modules` (versions per
`docs/design-tokens/README.md`, read 2026-09-26).

This file lives here (not under `docs/design-tokens/`) because `docs/` is
gitignored (`docs/*`, `.gitignore:21`) except the published docs the lines
after it un-ignore: `docs/architecture.md`, `docs/decisions.md` and
`docs/deploy.md`. Anything else placed there isn't committed.

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

### Primary and tertiary buttons

App-wide, not Ask-only: every `kind="primary"` Carbon `Button`/`IconButton`
(and Carbon's own primary actions, e.g. a non-passive `Modal` footer) is
teal. Set once in `../styles/_carbon-tokens.scss` by configuring Carbon's
own button component tokens before `@carbon/react` loads, so no component
carries button color styling of its own.

| Carbon component token | Stock (every theme) | This app (every theme) |
|---|---|---|
| `button-primary` | `blue-60` `#0f62fe` | `teal-60` `#007d79` |
| `button-primary-hover` | `blue-60-hover` `#0050e6` | `teal-60-hover` `#006b68` |
| `button-primary-active` | `blue-80` `#002d9c` | `teal-80` `#004144` |

Tertiary (outline) buttons are teal too (decided 2026-09-28). Carbon's
stock tertiary isn't one color per role: it's blue in white but white in
g100, because its label sits on the page at rest and it fills with
`text-inverse` on hover/focus/press. So it follows that shape:

| Carbon component token | Stock white / g100 | This app, white | This app, g100 |
|---|---|---|---|
| `button-tertiary` | `#0f62fe` / `#ffffff` | `teal-60` `#007d79` | `teal-30` `#3ddbd9` |
| `button-tertiary-hover` | `#0050e6` / `#f4f4f4` | `teal-60-hover` `#006b68` | `teal-30-hover` `#25cac8` |
| `button-tertiary-active` | `#002d9c` / `#c6c6c6` | `teal-80` `#004144` | `teal-50` `#009d9a` |

Tertiary label contrast: white 4.99:1 on the page and 4.54:1 on `layer-01`
at rest, 6.36 / 11.42:1 filled; g100 10.63:1 on the page and 8.89:1 on
`layer-01` at rest, then `#161616` on the fill at 10.63 / 8.93 / 5.42:1
(focus / hover / press).

Same shape as Carbon's stock values: one color per role, identical in white
and g100. Not the reference's `tealHover` (`teal-50` in dark): white label
text on `teal-50` is 3.34:1, under 4.5:1.

Primary and tertiary buttons change through their own tokens. Ghost
buttons have no color token of their own — their label is `link-primary`
at rest and `link-primary-hover` on hover/press — so they're teal through
the link tokens (next-but-one section). Ghost was first kept blue (earlier
2026-09-28); moving links to teal later the same day moved ghost with them,
by decision, rather than pinning ghost back to blue with a component-scoped
override. `interactive` and `border-interactive` stay Carbon blue, so
checkboxes and selection markers keep Carbon's blue. The focus ring is its
own override (next section). Disabled primary buttons keep Carbon's gray
disabled tokens. `Shared/Core/Button` in Storybook shows every kind × state
in both themes.

Measured with `getComputedStyle()` in Storybook (`EditRecordForm` "Save
changes", `Composer` send), both themes:

| State | Fill | White label/icon | Fill vs page (white / g100) |
|---|---|---|---|
| Rest | `#007d79` | 4.99:1 | 4.99 / 3.63:1 |
| Hover | `#006b68` | 6.36:1 | 6.36 / 2.85:1 |
| Active | `#004144` | 11.42:1 | 11.42 / 1.59:1 |

Label contrast passes AA (4.5:1) in every state and theme. Fill-vs-page is
within 0.01 of stock Carbon blue at rest (5.00 / 3.62:1); the hover and
active fills are darker than the g100 page can separate, as they are with
stock blue, and the label identifies the button in those states.

### Focus ring

App-wide: every Carbon component's ring (buttons of every kind, fields,
links, checkboxes, tabs, header items) and the app's own `vars.$focus`
rings. Set in `../styles/_carbon-tokens.scss` (`focus-tokens` mixin,
included by `index.scss` after Carbon) by declaring `--cds-focus` /
`--cds-focus-inverse` on Carbon's own theme selectors (`:root`,
`.cds--white`, `.cds--g10`, `.cds--g90`, `.cds--g100`).

| Token | Stock white | This app, white | Stock g100 | This app, g100 |
|---|---|---|---|---|
| `focus` | `blue-60` `#0f62fe` | `teal-60` `#007d79` | `white` `#ffffff` | `teal-30` `#3ddbd9` |
| `focus-inverse` | `white` | `teal-30` | `blue-60` | `teal-60` |

**Why not configure Carbon's `$theme` / `$zones` maps instead:** Carbon
picks each component token's per-theme value by comparing theme maps
key-for-key (`theme.matches()`). A g100 map with a changed `focus` no longer
matches Carbon's stock `$g100`, so the `.cds--g100` zone silently stopped
emitting every button, tag and notification component token (caught by
diffing the compiled CSS). Declaring the two custom properties on the zone
selectors leaves Carbon's theme maps untouched. The compiled-CSS diff against
the stock build is exactly the four focus declarations.

**Why teal-30 in g100, not teal-60:** Carbon's stock g100 ring is white, the
lightest available. Teal-60 would fall to 2.4:1 on `layer-02` (`#393939`,
fields inside a modal); teal-30 keeps 6.78:1 there. Teal-30 is also Direction
B v2's dark `tealLight`.

**Measured contrast (WCAG 1.4.11 non-text, 3:1 required).** Keyboard Tab
through the real app (login, Records dashboard, New session modal, record
detail, edit form, delete confirm, Ask empty state and answer, source modal,
Saved Insights) in both themes, with `getComputedStyle()` reading the ring
and the composited color it sits on. 200 focus stops.

| Surface the ring sits on | White | g100 |
|---|---|---|
| Page `$background` | 4.99:1 (`#ffffff`) | 10.63:1 (`#161616`) |
| `$layer-01` (modals, cards, search, rail picker) | 4.54:1 (`#f4f4f4`) | 8.89:1 (`#262626`) |
| Selected conversation row (`background-selected`) | 4.07:1 (`#e8e8e8`) | 7.42:1 (`#333333`) |
| Fields inside a modal (`field-02`) | 4.99:1 (`#ffffff`) | 6.78:1 (`#393939`) |
| Button focus inset (`focus-inset`) | 4.99:1 (`#ffffff`) | 10.63:1 (`#161616`) |

No surface failed with teal, so there are no Carbon-default fallbacks. Three
contexts don't follow the table above, each on purpose:

- **CKEditor in g100** (Create/Edit record forms), `../styles/_ckeditor.scss`.
  CKEditor isn't dark-themed: its toolbar and editing area stay white inside
  the g100 modal. Teal-30 on that white is 1.70:1 (fails), so dark themes use
  `focus-inverse` (teal-60) there: 4.99:1 on the white fill, 3.03:1 on the
  modal. CKEditor's stock blue (`#3779eb`) was 4.12 / 3.67:1. In white the
  editor uses `focus` (teal-60), 4.99 / 4.54:1. CKEditor's 1px border width
  is kept.
- **Date picker's focused day:** Carbon colors it from `button-primary`, not
  `focus`, so it's teal-60 in both themes: 3.03:1 on the g100 calendar
  (`#262626`), identical to stock blue-60 (3.03:1). Passes at the threshold;
  changing it would mean overriding Carbon's date-picker CSS.
- **Login screen:** always renders in the white theme. `useTheme` only runs
  inside `Header`, which mounts after login. This is older than the teal
  change, and the ring there measures as the white-theme values.

Custom (non-Carbon) focus targets that used the browser's default ring now
use `vars.$focus` like the rest: conversation-list rows, starter questions,
"Save as deliverable", and links inside a record's HTML body. The composer
text box's `$chat-accent` ring override is removed: it existed only to be
teal rather than Carbon blue, and it gave 3.03:1 in g100 where the token
gives 8.89:1.

### Links (decision, 2026-09-28)

A deliberate extension, not a bug fix: links join the teal system with the
buttons and focus ring. Declared alongside `focus` in
`../styles/_carbon-tokens.scss` (`theme-tokens` mixin), on Carbon's own
theme selectors, for the same reason (see "Focus ring"). Carbon's global
`a { color: var(--cds-link-primary) }` means plain links — record bodies,
CKEditor content — follow without per-component styling, as do breadcrumb
crumbs, Ask's citations (`vars.$link`) and ghost buttons.

| Token | Stock white | This app, white | Stock g100 | This app, g100 |
|---|---|---|---|---|
| `link-primary` | `blue-60` | `teal-60` `#007d79` | `blue-40` | `teal-40` `#08bdba` |
| `link-primary-hover` | `blue-70` | `teal-80` `#004144` | `blue-30` | `teal-30` `#3ddbd9` |
| `link-secondary` | `blue-70` | `teal-70` `#005d5d` | `blue-30` | `teal-30` |
| `link-inverse` | `blue-40` | `teal-40` | `blue-60` | `teal-60` |
| `link-inverse-hover` | `blue-30` | `teal-30` | `blue-70` | `teal-70` |
| `link-visited` | `purple-60` | unchanged | `purple-40` | unchanged |

One step for one step with Carbon's blues, except light
`link-primary-hover`: teal-80, not teal-70 — see the ghost button note
below. `link-visited` keeps Carbon's purple: "visited" is a different
meaning, not a brand color.

**Measured** (running app and `Shared/Core/Link`, `getComputedStyle()`,
AA 4.5:1 for text):

| Context | White | g100 |
|---|---|---|
| Breadcrumb crumb (page) | 4.99:1 | 7.75:1 |
| Record-body link (modal, `layer-01`) | 4.54:1 | 6.48:1 |
| Ask citation, rest / hover | 4.54 / 9.29:1 | 6.48 / 7.05:1 |
| On `layer-02` (computed; no link renders there today) | 4.99:1 | 4.95:1 |
| CKEditor content link | 4.99:1 | 4.99:1 (exception below) |

**Exception — CKEditor in g100** (`../styles/_ckeditor.scss`): the editing
area stays white in the dark theme, so the g100 link (teal-40) would be
2.33:1 on it. This wasn't new: Carbon's stock g100 link, blue-40, was
already 2.35:1 there. Inside `.ck-content` in dark themes, `link-primary` /
`-hover` are re-pointed to the inverse pair (Carbon's token for a link on a
light surface in a dark theme): teal-60 at 4.99:1, hover teal-70 at 7.71:1.
Same shape as the focus-ring exception for the same surface.

**Ghost button pressed state — fixed here.** Chromatic's a11y check flagged
`Shared/Core/Button`'s ghost *active* cell in white: `#0043ce` on `#c1c1c1`
= 4.33:1 (the label on Carbon's 50% gray `background-active`, over
`layer-01`). Pre-existing Carbon behavior — none of the tokens involved
(`link-primary-hover`, `background-active`, `layer-01`) was overridden — and
newly caught because storybook-addon-pseudo-states now forces the pressed
state. Stock blue-70 on the page background just passes (4.56:1), which is
why nothing in the app had surfaced it. Fixed at the token: light
`link-primary-hover` is teal-80, not the teal-70 a strict step-for-step
mapping gives (teal-70 there would be 4.28:1 — the same failure). Ghost
label contrast now, every state (white page / white `layer-01` / g100 page /
g100 `layer-01`): rest 4.99 / 4.54 / 7.75 / 6.48, hover 10.11 / 9.32 /
8.54 / 7.10, pressed 6.68 / 6.34 / 5.54 / 4.81. axe: no violations in
either Button or Link story, either theme.

### Color-vision deficiency check

Machado, Oliveira & Fernandes (2009) simulation at full severity, in linear
RGB (the model Chrome DevTools' vision-deficiency emulation uses). Two ways:
numerically, simulating each color pair and measuring CIEDE2000 ΔE (≥10 reads
as clearly different; <5 as the same color) plus luminance contrast; and
visually, rendering `Shared/Core/Button` through the same matrices as an SVG
`feColorMatrix` filter.

How the new values simulate: under protanopia and deuteranopia every teal
collapses to a neutral gray (`#007d79` → `#757679` / `#666b7a`; `#3ddbd9` →
`#cdd0d9` / `#b6bfda`). Under tritanopia it stays teal. Carbon's stock blue
stays blue for all three.

**Teal vs red** (danger, `danger--tertiary`, `support-error`, `text-error`,
red tag): distinguishable for all three types in both themes. Lowest is
protanopia in g100, `button-primary` vs `support-error` `#fa4d56`: ΔE 15.4,
luminance 1.02:1. The difference is hue only (gray vs olive), with no
lightness cue, so it's noticeable but not large. Deuteranopia ≥ 29.3,
tritanopia ≥ 49.6.

**Teal vs green** (`support-success`, not rendered anywhere today): ΔE
10.8 / 10.5 under tritanopia (white `button-primary` / g100 `focus`), ≥ 26.7
otherwise. Recheck if a green kind or success state lands next to teal.

**Interactive vs disabled:** primary vs disabled fill stays distinct for all
three types (white ΔE ≥ 25.0, luminance ≥ 2.66:1; g100 ΔE ≥ 18.8), and the
disabled label is dimmed besides. The focus ring stays high-contrast against
its surfaces for all three types (white ≥ 4.13:1, g100 ≥ 8.25:1).

**Findings:**

| Pair (theme) | Protan ΔE | Deutan ΔE | Stock blue, protan |
|---|---|---|---|
| `button-primary` vs `secondary` (g100) | 3.3 | 7.8 | 28.9 |
| `button-primary-hover` vs `secondary` (g100) | 4.2 | 10.5 | — |
| `button-primary-active` vs disabled fill (g100) | 4.4 | 7.5 | 25.9 |
| `button-primary-active` vs `secondary` (white) | 4.5 | 7.5 | 26.0 |

Primary and secondary buttons read as the same gray for protan and deutan
users in g100. This is new with teal. The active rows are the brief pressed
state. It isn't a WCAG failure: each button's text names its action, and
button emphasis isn't information conveyed only by color (1.4.1). But it
flattens the primary/secondary hierarchy. No screen shows primary and
secondary together today; a primary + filled-secondary pair (e.g. a Carbon
Modal footer) should be avoided, or paired with the reference's outline
Cancel instead.

**Known tradeoff, accepted 2026-09-28 — don't revert primary to blue
without revisiting this.** Teal was kept as the primary color knowing that
primary and filled-secondary buttons read as the same gray in g100 for
protan/deutan users (stock blue kept them ΔE 28.9 apart). The mitigation is
structural rather than a color change: never pair a primary with a *filled*
secondary. Where an action needs a companion (the New session modal's
Cancel), use an outline (tertiary) button, which stays distinct from a
filled primary under every simulation. Reverting to blue would restore the
hierarchy for those users but drop the teal decision, so weigh both.

Tertiary teal under simulation: vs the red `danger--tertiary` it sits next
to on the record detail modal, ΔE ≥ 23.2 (white) / ≥ 33.4 (g100) for all
three types; vs ghost (still link blue) ΔE ≥ 11.7 (tritanopia, g100).

## Record kinds (Research Records, no new tokens)

Direction B v2's `RECORD_KIND` colors (raw teal-60, finding green-60,
component red-60, analytics purple-60, deliverable magenta-70) map onto
Carbon `Tag` types — `recordKinds.js`: raw `teal`, finding `green`,
component `red`, analytics `purple`, deliverable `magenta` — so the kind
badge (`RecordKindTag`) is a stock Carbon Tag in both themes. The card's
3px start-edge stripe and the rail's swatch use the same kind's
`tag-color-<type>` component token (`$record-kind-colors` in
`../styles/_variables.scss`), so badge, stripe and swatch always agree.

Measured in the running app (1280px, `getComputedStyle()`, WCAG non-text
3:1):

| | White | g100 |
|---|---|---|
| Stripe vs card (`layer-02`) | 7.69 – 7.79:1 (70-grade, e.g. `#005d5d`) | 8.70 – 8.90:1 (20-grade, e.g. `#9ef0f0`) |
| Stripe vs content surface (`layer-01`) | 6.99 – 7.08:1 | 11.40 – 11.66:1 |
| Swatch vs rail (`background`) | 7.69 – 7.79:1 | 13.63 – 13.94:1 |

axe: no violations on the dashboard (with the tag-count badge showing), the
New session modal or the record detail modal, in either theme. Record tags
are Carbon `gray` Tags (were `blue`).

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

### Wiring additions (Carbon tokens re-exported, not custom colors)

Wiring the Ask tab to `POST /api/ask` added two more plain re-exports to
`_variables.scss`, again with no custom values:

- `$link` / `$link-hover` → `theme.$link-primary` / `theme.$link-primary-hover`:
  the inline `[n]` citation buttons in an answer (`chat/AssistantMessage`),
  since a citation is a link to its source. The chip's border is
  `$border-strong`, its hover fill `$background-hover`, its focus ring `$focus`.

The citation chip is `label-01` text (small, so it needs 4.5:1) and sized
24×24px for WCAG 2.2's target-size minimum. Measured with
`getComputedStyle` and WCAG luminance math on its two real backgrounds —
inside `ChatPanel` (`$surface`) and on the plain page (`$background`, the
`AssistantMessage` stories) — text / border / focus ring against what's
around it:

| Theme | Background | At rest | Hover | Focus ring |
|---|---|---|---|---|
| White | `$surface` `#f4f4f4` | 4.55 / 3.02 | 6.34 / 3.02 | 4.55 |
| White | `$background` `#ffffff` | 5.00 / 3.32 | 6.92 / 3.32 | 5.00 |
| G100 | `$surface` `#262626` | 6.43 / 3.01 | 7.04 / 3.01 | 15.13 |
| G100 | `$background` `#161616` | 7.68 / 3.60 | 8.54 / 3.60 | 18.10 |

White on `$surface` passes narrowly (4.55:1, the same as Carbon's own
tertiary buttons in the modal above); it's Carbon's link color on Carbon's
layer, so it moves with Carbon if either changes.

One Carbon override came with it, in `chat/Composer.module.scss`: Carbon
greys a disabled `TextArea`'s helper text to `$text-disabled`, which axe
flagged at about 3:1 in both themes. The composer's "Each question is
answered on its own" hint matters most while the field is disabled
(waiting for an answer, or asking unavailable), so it stays
`$text-secondary`. It targets Carbon's `cds--form__helper-text--disabled`
class (@carbon/react 1.116); re-check after an upgrade.

### Project picker (Carbon `Dropdown`, no new tokens)

The left rail's project picker is Carbon's own `Dropdown` (`size="sm"`),
replacing a hand-built vertical list of buttons. It brings its own field,
menu, selected and highlighted colors; the only thing this app styles is
the per-item record count, which reuses `$text-secondary`. The field sits
on the rail's `$background`, the level Carbon's `$field-01` is meant for.
Measured in the running app at 1280×860 with the ten-project real list
(WCAG math on `getComputedStyle()`, white / g100):

| Element | Backdrop (white / g100) | White | G100 |
|---|---|---|---|
| "Project" label | `$background` `#ffffff` / `#161616` | 7.81 | 10.59 |
| Selected value, closed | `$field-01` `#f4f4f4` / `#262626` | 16.45 | 13.76 |
| Menu item label and count, at rest or highlighted | `$field-01` | 7.10 | 8.86 |
| Selected item label | `$layer-selected` `#e0e0e0` / `#393939` | 13.71 | 10.50 |
| Selected item count | `$layer-selected` | 5.92 | 6.76 |

axe reports no violations on the rail, open or closed, in either theme.

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
(chat / rails / insights / sources / fixtures), mirroring how the
Figma Make export was already decomposed
(`docs/Build_Direction_B_v2_Design_decomposed/DECOMPOSITION_NOTES.md`) rather
than the existing app's flat `src/*.jsx` convention — this feature is large
enough (~15+ files across a page shell, chat panel, two rails, and saved
insights) that flattening it into `src/` alongside `Dashboard.jsx` would be
unnavigable. Each component still follows the app's existing per-file
convention (`Name.jsx` + `Name.module.scss` + `Name.test.jsx`, default
export, CSS Modules via `@use './styles/variables'`).

`sources/` (`KindTag`), `shell/` (`BreadcrumbBar`), `rails/` (project
picker + conversation history), and now `chat/` (message list, composer,
assistant responses) all exist. Planned shape for the remaining tickets:

```
frontend/src/ask-the-repo/
  AskTheRepo.jsx / .module.scss / .test.jsx   # page shell (mounts next to Dashboard)
  TOKEN_MAPPING.md                            # this file
  shell/
    BreadcrumbBar.jsx / .module.scss          # breadcrumb sub-header, built in the page-shell ticket
  chat/
    ChatPanel.jsx / .module.scss / .test.jsx / .stories.jsx        # built in this ticket
    ChatPanel.stories.module.scss             # the chat column's real frame for the ChatPanel stories
    ChatMessage.jsx / .module.scss / .test.jsx / .stories.jsx      # built in this ticket
    AssistantMessage.jsx / .module.scss / .test.jsx / .stories.jsx # built in this ticket
    Composer.jsx / .module.scss / .test.jsx / .stories.jsx         # built in this ticket
    StarterQuestions.jsx / .module.scss / .test.jsx / .stories.jsx # built in this ticket
    useAskRepo.js / .test.jsx                 # conversations, messages and POST /api/ask requests (replaced useConversationMessages when the tab was wired)
    askCopy.js                                # loading, error and "not available" wording, shared by ChatPanel and useAskRepo
    starters.js                               # starter questions checked against the real corpus
  rails/
    LeftRail.jsx / .module.scss / .test.jsx / .stories.jsx         # built in the left-rail ticket
    LeftRail.stories.module.scss              # the rail's real frame for the LeftRail and ProjectSwitcher stories
    ProjectSwitcher.jsx / .module.scss / .test.jsx / .stories.jsx  # built in the left-rail ticket; a Carbon Dropdown since the rail redesign
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
  fixtures/                                   # story/test data only (was mock/, the app's data source before the tab was wired)
    constants.js                              # PROJECTS — built in the left-rail ticket; CONFIG_PROJECTS, the real corpus's list
    conversations.js                          # CONVERSATIONS — built in the left-rail ticket
    messages.js                               # INITIAL_MESSAGES_BY_CONVERSATION — built in Story 4; sources gained contextBefore/contextAfter in Story 5
    starters.js                               # STARTERS — built in this ticket; the app's real list is chat/starters.js
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
