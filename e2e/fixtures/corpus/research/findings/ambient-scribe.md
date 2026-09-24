---
title: Ambient AI Scribe
date: 2026-01-13
type: synthesis
status: synthesized
researcher: Priya Patel
tags:
  - ambient-scribe
  - documentation
  - ga-release
  - longitudinal
  - usability
  - v0.1
  - v0.2
related_components:
  - ambient-scribe-widget
  - encounter-view
related_findings:
  - governance-and-phi.md
  - clinician-experience-documentation-burden.md
  - ambient-scribe-post-ga-refinements.md
---

# Ambient AI Scribe

## Overview
The ambient AI scribe has moved from a formative concept (v0.1, Feb 2025) through iteration
(v0.2, Sep 2025) to a GA release candidate (Jan 2026), with 3 of the original 5 physician
participants retained across all three rounds for longitudinal comparison.

- **PHI handling:** The critical draft-retention/audit gap found in v0.1 was fixed by v0.2 and has
  remained stable through the GA candidate — drafts auto-expire after 10 minutes of inactivity and
  the behavior is documented for Compliance. No PHI-handling issues have recurred since.
- **Accuracy:** Medication dosage errors dropped from 3/5 sessions (v0.1) to 1/5 (v0.2), driven by
  fixing outright garbling; the remaining error class is specifically sound-alike medication names,
  which is now a tracked, monitored issue rather than a blocker.
- **Trust calibration was the hardest problem, and accuracy alone didn't solve it.** Returning
  participants read every line in both v0.1 and v0.2 despite the accuracy improvement between them —
  trust didn't move with correctness. The GA-candidate round introduced per-line confidence
  highlighting, and for the first time participants reported actually skimming high-confidence
  lines. This is the strongest evidence so far that *visible uncertainty*, not raw accuracy, is the
  lever that changes reviewing behavior.
- **Recommendation status:** Approved for GA release. Sound-alike medication errors move to
  post-GA monitoring rather than blocking launch.

Open thread: this tool's rollout scope has been deliberately kept away from behavioral health /
substance-use encounters — see [scope-boundaries-and-workflow-fit.md](scope-boundaries-and-workflow-fit.md).

## Evidence Trail
- **2025-02-25** — [Usability Test — Ambient AI Scribe Prototype v0.1](../raw/2025-02-25-usability-test-ambient-scribe-v01/session-notes.md) *(`usability-test`)*
- **2025-09-23** — [Usability Test — Ambient AI Scribe Prototype v0.2 (Follow-up)](../raw/2025-09-23-usability-test-ambient-scribe-v02/session-notes.md) *(`usability-test`)*
- **2026-01-13** — [Usability Test — Ambient AI Scribe GA Release Candidate (Final Validation)](../raw/2026-01-13-usability-test-ambient-scribe-ga-release-candidate/session-notes.md) *(`usability-test`)*

## Related Findings
- [AI Governance, PHI & Compliance](governance-and-phi.md)
- [Clinician Experience & Documentation Burden](clinician-experience-documentation-burden.md)
- [Ambient Scribe — Post-GA Refinements](ambient-scribe-post-ga-refinements.md)
