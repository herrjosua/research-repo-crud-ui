# Frontend conventions

## Theming & Component Conventions

These rules apply to every color, token, and component decision in this
project going forward — not just what's documented below. Read this
section before touching any color or building any new component.

### Colors & tokens

1. **Use core Carbon theme values first.** Reach for an existing Carbon
   semantic token (`theme.$text-secondary`, `theme.$background-hover`,
   etc.) before considering a custom value. Most needs are already
   covered by Carbon's token set.

2. **Match the token to the actual elevation the component sits on,**
   not just the theme name. "White theme" isn't one background — a
   component on `$background` needs different hover/selected tokens
   than one on `$layer-01`. Check what the component's real parent
   background is before picking a token (this exact mismatch caused a
   real bug in Story 3 — `$layer-hover`/`$layer-selected` used on a
   `$background`-level component).

3. **Custom colors are allowed when no Carbon token fits** (e.g.
   `transcript`'s orange — see `ask-the-repo/TOKEN_MAPPING.md#kindtag`
   for the shipped example), but they must:
   - Be defined as a SCSS variable in this project's own theme layer
     (same file/pattern as the teal primary override) — never
     hardcoded inline in a component's stylesheet
   - Never touch or edit Carbon's own package files — the override sits
     on top of Carbon, it doesn't modify Carbon's source
   - Define both light and dark values together, switched by the same
     mechanism Carbon's own tokens use (the `g100` class selector), not
     a separate parallel system
   - Pass contrast in every real context where the component actually
     renders — see verification rules below

4. **Fix a token at its source, once, not per call site.** If a
   contrast or color bug traces back to one shared variable, fix that
   variable and let every consumer inherit the fix — don't patch each
   component's stylesheet individually (see the `$text-secondary` fix
   in Story 3 for the right pattern).

5. **Document every custom override in `TOKEN_MAPPING.md`** (the
   feature's own, e.g. `ask-the-repo/TOKEN_MAPPING.md`) — what it maps
   to, why no Carbon token fit, and its verified contrast values.
   Future reuse should check this doc first instead of re-deriving from
   scratch.

### Verification

6. **Contrast must pass in every real rendering context, not just the
   one it was first tested against.** A token proven correct on one
   background is not proven correct everywhere it gets reused — this
   exact gap caused the same orange-contrast bug to resurface three
   times across three different tickets. When adding a new consumer of
   an existing color/token, re-verify contrast against that specific
   background before assuming it's covered.

7. **Verify with real measurements, not visual inspection or formula
   alone** — `getComputedStyle()` plus real contrast math, checked in
   both themes, against every relevant state (default/hover/selected,
   not just default rendering).

8. **New components need a Storybook story that renders every real
   background context they'll actually appear in** — not just the
   default canvas — so contrast regressions surface automatically in
   Chromatic/CI instead of requiring manual discovery later.

### Components & structure

9. **Prefer out-of-the-box Carbon components over custom-built ones.**
   Check Carbon's component library for an existing fit before building
   something bespoke.

10. **Any custom-built component must be structured to survive a Carbon
    version upgrade cleanly** — isolate Carbon-specific integration
    points so an upgrade touches one place, not every call site. When a
    custom piece depends on a specific Carbon version's behavior, note
    that dependency explicitly in a comment.

11. **Use Carbon's Grid/Column for page-level layout, not hand-rolled
    flexbox or fixed padding.** This is what gives every page
    responsive margins/gutters automatically — bypassing it (as
    happened once with `BreadcrumbBar`/`Tabs`) creates visible layout
    drift against every other page.

12. **Prefer CSS holding layout correctness by construction over
    JS-measured layout.** If two elements need to match height or size,
    look for a real bounded-height flex/grid chain from a proper
    ancestor first. Needing `ResizeObserver` or manual measurement to
    keep two elements in sync is usually a sign of a missing structural
    foundation upstream, not a problem to solve with more JS (see the
    rail/chat-panel height-matching saga in Story 4 for the
    wrong-then-right approach).

13. **Match new UI to the closest existing shipped page**, not a
    second, separately-invented pattern for the same kind of element
    (nav, breadcrumb, footer, page shell). When in doubt, find how
    `Dashboard.jsx`/`Header.jsx` already solved the same problem and
    reuse that.
