---
title: Usability Test — AI-Assisted Prior Authorization Drafting (v1)
date: 2025-04-08
type: usability-test
status: raw
tags:
  - prior-auth
  - usability
  - utilization-management
  - v1
related_components:
  - prior-auth-drafting-panel
related_findings:
  - ../../findings/prior-authorization.md
---

# Usability Test — AI-Assisted Prior Authorization Drafting (v1)

## Objective
Test whether an AI-drafted prior authorization request (pulling from chart data to pre-fill medical necessity justification) speeds up the process without introducing errors that could cause denials.

## Method
- **Method:** Moderated usability test, 4 realistic case scenarios, 60 min/session
- **Researcher:** Priya Patel
- **Full participant roster:** see `participants.md` in this folder

## Key Findings
- **[HIGH]** *(accuracy)* In 2 of 4 cases, the AI draft cited outdated diagnosis codes still present elsewhere in the chart rather than the most recent/active ones, which participants said would likely cause a payer denial if submitted as-is.
- **[HIGH]** *(liability concern)* The supervisor was firm that nurses would still need to read every AI-drafted justification in full before submission, since a wrongly submitted prior auth can delay patient care by days — no shortcut is acceptable here.
- **[HIGH]** *(time savings (positive))* Despite the above, participants estimated the draft cut initial drafting time from ~15 minutes to ~5 minutes per straightforward case when the citation was correct, which was seen as a real win if accuracy improves.
- **[MEDIUM]** *(transparency)* Participants wanted to see which specific chart entries the AI pulled from, inline, rather than trusting a black-box summary — 'show your work' was mentioned unprompted by 3 of 4.

## Representative Quotes
> "Five minutes saved is great until it's the case that gets denied and now I'm on the phone with the payer for 40 minutes instead. Show me where it got that info."
> — Utilization Review Nurse, P17

> "I actually really liked this for the boring, obvious cases. Just don't let it near the complicated ones yet."
> — Utilization Review Nurse, P19

## Recommendations
1. Fix the outdated-diagnosis-code issue before any further piloting; this is a correctness bug, not a UX issue.
2. Add inline source citations (chart entry + date) for every claim in the generated justification.
3. Consider limiting initial pilot scope to 'straightforward' case types the nurses themselves can help define, deferring complex cases.

## Follow-ups / Open Questions
- Work with engineering to confirm whether the outdated-code issue is a data-freshness bug or a model retrieval issue.
- Ask supervisor to help define what counts as a 'straightforward' case for a narrower v2 pilot scope.

## Related
- Synthesized into: [prior-authorization.md](../../findings/prior-authorization.md)
