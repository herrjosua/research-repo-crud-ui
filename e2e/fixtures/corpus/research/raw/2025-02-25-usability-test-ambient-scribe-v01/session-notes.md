---
title: Usability Test — Ambient AI Scribe Prototype v0.1
date: 2025-02-25
type: usability-test
status: raw
tags:
  - ambient-scribe
  - usability
  - documentation
  - v0.1
related_components:
  - ambient-scribe-widget
  - encounter-view
related_findings:
  - ../../findings/ambient-scribe.md
---

# Usability Test — Ambient AI Scribe Prototype v0.1

## Objective
First formative usability test of the ambient AI scribe concept, focused on accuracy, trust, and any early PHI-handling red flags before further investment.

## Method
- **Method:** Moderated usability test, simulated patient encounters, 45 min/session
- **Researcher:** Priya Patel
- **Full participant roster:** see `participants.md` in this folder

## Key Findings
- **[CRITICAL]** *(phi-handling)* In 2 of 5 sessions, the prototype's draft transcript persisted in an editable state after the simulated encounter ended with no clear indication of where/how long it was stored — a potential PHI retention/audit gap that needs Security review before any real-patient pilot.
- **[HIGH]** *(accuracy)* The scribe correctly captured the chief complaint and HPI in all 5 sessions but missed or garbled medication dosages in 3 of 5 — physicians said this was disqualifying for direct sign-off without review.
- **[HIGH]** *(trust calibration)* 4 of 5 participants read every line of AI-generated text before accepting it in this first exposure; none trusted it enough to skim, which undercuts the time-savings premise if that behavior persists post-adoption.
- **[MEDIUM]** *(interaction)* Participants were unsure how to correct a single wrong sentence without regenerating the whole note; the edit affordance wasn't discoverable.
- **[MEDIUM]** *(workflow fit)* The 'start listening' control required a manual click, which physicians said they would likely forget mid-conversation with a patient.

## Representative Quotes
> "I love what it got right, but I have to read every word anyway right now, so where's the time savings? Ask me again in a month."
> — Physician, Internal Medicine, P09

> "Wait — where did that draft just go when I closed the window? That's the kind of question Legal is going to ask me."
> — Physician, Family Medicine, P11

## Recommendations
1. Escalate the draft-transcript retention behavior to Security/Compliance before any additional testing involving even simulated PHI-like content.
2. Redesign the correction interaction so a single line can be edited/regenerated in place.
3. Investigate ambient 'always listening within visit' activation (with clear consent/indicator) instead of manual start to fix the workflow-fit issue.

## Follow-ups / Open Questions
- Re-test v0.2 with the same participants where possible for longitudinal comparison.
- Confirm with Compliance whether draft-state ambient transcripts need to be retained/audited even if never finalized.

## Related
- Synthesized into: [ambient-scribe.md](../../findings/ambient-scribe.md)
