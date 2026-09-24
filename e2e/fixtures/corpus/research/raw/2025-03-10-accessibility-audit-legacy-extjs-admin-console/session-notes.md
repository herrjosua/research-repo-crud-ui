---
title: Accessibility Audit — Legacy Admin Console (ExtJS)
date: 2025-03-10
type: accessibility-audit
status: raw
tags:
  - accessibility
  - wcag
  - extjs
  - legacy
  - section-508
related_components:
  - admin-console-grid
related_findings:
  - ../../findings/accessibility-cross-cutting.md
---

# Accessibility Audit — Legacy Admin Console (ExtJS)

## Objective
Assess the accessibility of the legacy ExtJS-based admin console that Compass AI's governance dashboards would be built into or alongside, ahead of any decision to extend vs. replace it.

## Method
- **Method:** Manual WCAG 2.1 AA audit + screen reader walkthrough (NVDA, JAWS)
- **Researcher:** Priya Patel
- **Full participant roster:** see `participants.md` in this folder

## Key Findings
- **[CRITICAL]** *(screen reader)* Core data grids render without proper ARIA roles; NVDA announces rows as generic 'clickable text' with no column/row context, making the primary admin workflow effectively unusable non-visually.
- **[CRITICAL]** *(keyboard trap)* Modal dialogs for user permission edits trap focus with no visible or announced way to close via keyboard (Esc does not work in 2 of 4 modal types tested).
- **[HIGH]** *(color contrast)* Status indicator icons rely on color alone (red/yellow/green dots) with no text or pattern alternative, failing WCAG 1.4.1.
- **[HIGH]** *(focus order)* Tab order in the record-edit form does not match visual layout, jumping unpredictably between fieldsets.
- **[MEDIUM]** *(zoom/reflow)* Layout breaks below 1280px effective width even with the OS at 100% zoom, forcing horizontal scrolling that isn't announced.

## Representative Quotes
> "I've basically memorized which grid row is which by row count instead of by what it actually says, because the screen reader just says nothing useful."
> — IT Admin, screen reader user, P13

> "This isn't a modernization nice-to-have, this is a 508 complaint waiting to happen the day someone new tries to use it."
> — Accessibility Specialist (internal), Internal SME

## Recommendations
1. Treat the two critical findings (grid ARIA, keyboard trap) as blockers for building any new Compass AI governance UI on top of this console without remediation or replacement.
2. If replacement is on the table, use this audit as the accessibility baseline/requirements input for the new admin experience rather than re-auditing from scratch later.

## Follow-ups / Open Questions
- Determine whether legal/Section 508 has a documented remediation deadline already in place for this console independent of Compass AI.
- Scope effort estimate: incremental ARIA remediation vs. full rebuild.

## Related
- Synthesized into: [accessibility-cross-cutting.md](../../findings/accessibility-cross-cutting.md)
