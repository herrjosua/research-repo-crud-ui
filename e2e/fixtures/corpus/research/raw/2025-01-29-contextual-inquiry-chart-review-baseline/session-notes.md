---
title: Contextual Inquiry — Manual Chart Review Baseline (Care Coordinators)
date: 2025-01-29
type: contextual-inquiry
status: raw
tags:
  - baseline
  - chart-review
  - workflow
  - care-coordination
related_components:
  - chart-review-summary-panel
related_findings:
  - ../../findings/care-coordination-triage.md
---

# Contextual Inquiry — Manual Chart Review Baseline (Care Coordinators)

## Objective
Establish a baseline of how care coordinators currently review patient charts across encounters, to identify where an AI summarization tool could plausibly help without disrupting judgment calls.

## Method
- **Method:** In-person shadowing, 3 sessions x ~90 min
- **Researcher:** Priya Patel
- **Full participant roster:** see `participants.md` in this folder

## Key Findings
- **[HIGH]** *(cognitive load)* Coordinators manually cross-reference 3-4 systems (EHR, care management platform, a shared spreadsheet, and a legacy scheduling tool) to build a mental model of a patient's status before every outreach call.
- **[MEDIUM]** *(trust)* Coordinators already distrust auto-generated summaries from the EHR's built-in 'AVS' (after-visit summary) tool because they've caught it omitting recently changed medications twice in the past quarter.
- **[MEDIUM]** *(workaround)* One coordinator keeps a personal color-coding system in the shared spreadsheet that isn't documented anywhere else; if she's out, others reportedly 'just wing it.'
- **[MEDIUM]** *(time)* Chart review before an outreach call takes 8-14 minutes per patient depending on complexity; coordinators see 12-18 patients/day.

## Representative Quotes
> "I don't trust the summary the system spits out. I've been burned by it missing a med change, so now I just re-check everything myself, which kind of defeats the point."
> — Care Coordinator, P03

> "If it could just tell me what changed since I last touched this chart, that alone would save me time. I don't need it to think for me."
> — Care Coordinator (float pool), P05

## Recommendations
1. Scope an early AI concept around 'what changed since last review' rather than full summarization — matches an expressed need and avoids the trust gap seen with the existing AVS tool.
2. Investigate formalizing the informal color-coding workaround as a real feature so knowledge isn't siloed in one person.

## Follow-ups / Open Questions
- Quantify how often the AVS tool has missed medication changes — pull incident/complaint logs if they exist.
- Revisit with float-pool coordinators specifically; they may have different pain points due to less system familiarity.

## Related
- Synthesized into: [care-coordination-triage.md](../../findings/care-coordination-triage.md)
