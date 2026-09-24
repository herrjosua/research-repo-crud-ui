---
title: The Longitudinal Physician — Ambient Scribe
date: 2026-02-26
status: final
tags:
  - ambient-scribe
  - persona
  - longitudinal
  - trust-in-ai
related_findings:
  - ../research/findings/ambient-scribe.md
  - ../research/findings/ambient-scribe-post-ga-refinements.md
source_type: native
designer: Sam Okafor
segment: Physician, regular ambient-scribe user across multiple release cycles
based_on:
  - ambient-scribe.md
  - ambient-scribe-post-ga-refinements.md
---

# The Longitudinal Physician — Ambient Scribe

## Summary
Modeled on the one participant (P09, Internal Medicine) present across all three ambient-scribe
testing rounds — v0.1 (Feb 2025), v0.2 (Sep 2025), and the GA candidate (Jan 2026). Represents the
clinician whose relationship with the tool has actually changed over a year of iteration, not a
first-time impression.

## Goals
- Trust the tool enough to stop reading every generated line, without trusting it blindly.
- Catch the specific error types that matter clinically (medication names) rather than treating
  all uncertainty as equally worth flagging.
- Not lose work to session/security interruptions that are unrelated to the clinical task.

## What changed for this persona, round over round
- **v0.1 → v0.2:** Accuracy improved, but reading behavior didn't — still read every line, despite
  fewer errors to catch.
- **v0.2 → GA candidate:** The first behavior change came from *visible uncertainty* (per-line
  confidence highlighting), not from further accuracy gains — this persona began skimming
  high-confidence lines for the first time.
- **Post-GA (this initiative):** The next trust lever is specificity, not just visibility — a
  distinct medication-safety flag reads as more actionable than generic low confidence, but risks
  over-trusting anything left unflagged if that distinction isn't actively managed in the UI.

## Frustrations
- Generic "low confidence" signals don't tell this persona *what kind* of thing to double-check.
- Session locks during dictation currently look identical to data loss, which erodes trust in the
  tool independent of transcription accuracy itself.

## Based on
Longitudinal composite of participant P09 across the three sessions above, plus the 2026-02-10
medication-flag concept test and 2026-02-17 session-lock contextual inquiry.
