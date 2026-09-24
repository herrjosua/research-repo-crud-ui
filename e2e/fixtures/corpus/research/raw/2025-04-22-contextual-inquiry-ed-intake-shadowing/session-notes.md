---
title: Contextual Inquiry — Emergency Department Intake Shadowing
date: 2025-04-22
type: contextual-inquiry
status: raw
tags:
  - ed
  - intake
  - workflow
  - high-acuity
  - baseline
related_components:
  - ed-intake-form
related_findings:
  - ../../findings/scope-boundaries-and-workflow-fit.md
---

# Contextual Inquiry — Emergency Department Intake Shadowing

## Objective
Observe real-time intake workflow under peak load to assess where, if anywhere, an AI tool could realistically fit without adding cognitive burden during high-acuity moments.

## Method
- **Method:** In-person shadowing during peak hours (4-7pm), 2 sessions
- **Researcher:** Priya Patel
- **Full participant roster:** see `participants.md` in this folder

## Key Findings
- **[HIGH]** *(interruption tolerance)* Intake staff are interrupted every 2-4 minutes on average during peak hours (paged, walked up to, or called over); any AI tool requiring sustained attention to review/correct output is unlikely to be used in this specific role during peak windows.
- **[MEDIUM]** *(triage priority)* Registration/demographic data entry is frequently completed after the clinical triage, not before, contradicting the originally assumed 'intake happens first' workflow model.
- **[MEDIUM]** *(paper backup)* Staff keep a physical paper triage sheet as backup 'in case the system is slow,' which happens often enough (self-reported several times a shift) that any AI feature needs to survive or gracefully degrade during system slowness.
- **[LOW]** *(positive signal)* Registration clerk expressed interest in AI that could pre-fill demographic fields from insurance card photo capture, since that specific task is high-volume and low-judgment.

## Representative Quotes
> "You can build the smartest tool in the world, but if I have three people yelling for me at once, I am not sitting there reviewing an AI's homework."
> — ED Intake Nurse, P21

> "Just let me snap a photo of the insurance card and stop making me type the same sixteen fields for the hundredth time tonight."
> — ED Registration Clerk, P23

## Recommendations
1. Deprioritize any AI feature aimed at ED intake nurses specifically during peak hours; if pursued, target low-attention, high-volume tasks like the clerk's insurance-card idea instead.
2. Any AI feature in this environment must have a clearly tested degraded/offline mode given frequent system slowness.

## Follow-ups / Open Questions
- Talk to IT about actual system slowness frequency/root cause — is it a known, trackable issue?
- Explore insurance-card OCR pre-fill as a smaller, separate low-risk pilot candidate.

## Related
- Synthesized into: [scope-boundaries-and-workflow-fit.md](../../findings/scope-boundaries-and-workflow-fit.md)
