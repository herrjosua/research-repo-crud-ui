---
title: Interview — Privacy/Compliance Officer on De-Identification & Audit Trail Requirements
date: 2025-03-24
type: interview
status: raw
tags:
  - privacy
  - hipaa
  - de-identification
  - audit-trail
  - governance
related_components: []
related_findings:
  - ../../findings/governance-and-phi.md
---

# Interview — Privacy/Compliance Officer on De-Identification & Audit Trail Requirements

## Objective
Understand concrete de-identification, retention, and auditability requirements that any AI tool touching PHI must meet, to translate into design/engineering constraints.

## Method
- **Method:** 1:1 interview, 50 min
- **Researcher:** Priya Patel
- **Full participant roster:** see `participants.md` in this folder

## Key Findings
- **[HIGH]** *(de-identification standard)* Org requires Safe Harbor-level de-identification (all 18 HIPAA identifiers removed) for any data used in model fine-tuning or evaluation sets — Expert Determination method is not currently approved as an alternative internally.
- **[HIGH]** *(audit trail)* Any AI-generated content that becomes part of the legal medical record must be traceable to a specific model version and prompt/input at time of generation, retained for the same period as the record itself (currently 10 years per state requirement she cited).
- **[MEDIUM]** *(vendor risk)* Any third-party AI vendor must sign a Business Associate Agreement (BAA) and demonstrate the data is not used for their own model training by default — she flagged this as the most common gap in vendor pitches she's reviewed so far.

## Representative Quotes
> "If I can't tell you exactly which model version generated a line in the chart three years from now, we don't have a product, we have a liability."
> — Chief Privacy Officer, P15

> "Everyone says 'we don't train on your data' until you ask them to point to the contract clause. Half the time it's not actually in there."
> — Chief Privacy Officer, P15

## Recommendations
1. Add model-version + input provenance logging as a non-negotiable requirement in any AI feature's technical design, not a post-hoc addition.
2. Build a standard vendor-evaluation checklist item specifically requiring the BAA + no-training-on-our-data clause to be pointed to in the actual contract text, not just claimed in a sales deck.

## Follow-ups / Open Questions
- Get the exact state medical record retention period in writing (she cited 10 years from memory) to confirm before it's used as a hard requirement.
- Ask Legal whether Expert Determination de-identification could ever become an approved alternative, or if that door is closed.

## Related
- Synthesized into: [governance-and-phi.md](../../findings/governance-and-phi.md)
