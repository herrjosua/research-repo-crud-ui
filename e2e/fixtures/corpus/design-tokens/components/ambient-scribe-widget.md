---
title: Ambient Scribe Widget
component_id: ambient-scribe-widget
status: generated
generated_from: Figma (via sync_figma_tokens.py — not yet built; hand-authored here to match intended shape)
---

# Ambient Scribe Widget

**Figma node:** `figma://file/compass-ai-design/node/4021:88`

## Variants
- listening
- reviewing-draft
- confidence-highlighted (added post-2025-09)

## States
- idle
- recording
- draft-ready
- auto-expired

## Code mapping
`src/components/AmbientScribe/AmbientScribeWidget.tsx (Code Connect not yet set up on work repo — Figma MCP unavailable there)`

## Related Research Findings
- [Ambient Scribe](../../research/findings/ambient-scribe.md)
- [Scope Boundaries And Workflow Fit](../../research/findings/scope-boundaries-and-workflow-fit.md)

## Notes
The `draft-ready` state's auto-expiry behavior (10 min inactivity) was added directly in response to the 2025-02-25 critical PHI-retention finding. The `confidence-highlighted` variant was added after the 2025-09-23 findings showed accuracy fixes alone didn't change reviewing behavior.
