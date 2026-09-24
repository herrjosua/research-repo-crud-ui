---
title: Tag Glossary
date: 2026-01-13
type: synthesis
status: synthesized
tags:
  - glossary
related_components: []
related_findings: []
---

# Tag Glossary

Canonical list of tags used across `raw/` and `findings/` frontmatter. `build_index.py` should validate every frontmatter tag against this file and flag any that don't appear here, per the repo plan's tagging decision. Add new tags here *before* using them in a session, not after, to avoid near-duplicate drift (e.g. `onboarding` vs `first-run` vs `first-time-user`).

- **`42-cfr-part-2`** — Federal regulation giving substance use disorder records extra protection.
- **`accessibility`** — WCAG/Section 508 accessibility research.
- **`ai-generated-content`** — Content produced or drafted by an AI feature.
- **`ai-strategy`** — High-level organizational strategy/positioning for the Compass AI program.
- **`alert-fatigue`** — Risk of clinically low-value alerts causing staff to ignore all alerts.
- **`alert-triage`** — Prioritizing/ranking alerts or tasks for care coordinators.
- **`ambient-scribe`** — The ambient AI scribe documentation feature and its testing thread.
- **`audit-trail`** — Traceability/logging requirements for AI-generated or AI-assisted content.
- **`authentication`** — Login/identity verification mechanisms generally.
- **`baseline`** — Establishes a pre-AI or pre-change reference point for later comparison.
- **`behavioral-health`** — Behavioral health / substance use disorder care settings.
- **`billing`** — Billing-adjacent workflows tied to coding.
- **`burnout`** — Clinician burnout self-report and contributing factors.
- **`care-coordination`** — Care coordinator role and related workflows.
- **`change-management`** — Organizational rollout, training, and adoption planning.
- **`chart-review`** — Reviewing patient chart/record contents as part of a workflow.
- **`chatbot`** — Conversational AI interface research.
- **`clinician-experience`** — General clinician satisfaction/experience topics.
- **`clinician-workflow`** — General clinician-facing process/workflow, distinct from patient- or admin-facing workflow.
- **`cmio`** — Chief Medical Information Officer-level sessions.
- **`coding`** — Medical coding (ICD-10/CPT) workflows.
- **`compliance`** — Regulatory/policy compliance topics generally.
- **`components`** — Individual reusable UI components.
- **`dashboard`** — Clinician-facing dashboard surfaces.
- **`de-identification`** — Removing/obscuring identifiers from data, typically for model training or eval use.
- **`design-system`** — The shared component library used across Compass AI interfaces. Also used as the `design-system/` deliverable-folder tag (feature-002).
- **`documentation`** — Clinical documentation content or tooling generally.
- **`documentation-burden`** — Time/effort cost of clinical documentation.
- **`ed`** — Emergency Department specifically.
- **`executive`** — Sessions with C-suite or VP-level stakeholders.
- **`extjs`** — The legacy Sencha ExtJS admin console codebase.
- **`funnel`** — Quantitative conversion/drop-off funnel analysis.
- **`ga-release`** — General availability / production release milestone.
- **`governance`** — Decision-rights, sign-off authority, and oversight structures for AI features.
- **`heuristic-evaluation`** — Expert-review evaluation method (Nielsen-style heuristics), distinct from moderated research.
- **`high-acuity`** — Emergency or otherwise high-acuity clinical settings.
- **`him`** — Health Information Management department.
- **`hipaa`** — Health Insurance Portability and Accountability Act compliance.
- **`information-architecture`** — How information is organized/prioritized in an interface.
- **`intake`** — Patient intake/registration workflow.
- **`journey-map`** — End-to-end user journey across touchpoints (feature-002 `journey-maps/` deliverable).
- **`kickoff`** — Initial/first-touch session on a new topic or program phase.
- **`legacy`** — Pre-modernization systems, as opposed to new/replacement builds.
- **`legal-record`** — The legal medical record and what becomes part of it.
- **`longitudinal`** — Repeated measurement of the same subject over time.
- **`low-vision`** — Low vision accessibility needs specifically.
- **`medication-safety`** — Medication-name accuracy and error-prevention in clinical documentation, distinct from general transcription accuracy.
- **`mental-model`** — How users conceptually think about a system, independent of the UI (feature-002 `mental-models/` deliverable).
- **`mfa`** — Multi-factor authentication.
- **`mindset`** — Attitudinal/motivational segmentation, distinct from identity-based persona segmentation (feature-002 `mindsets/` deliverable).
- **`mobile`** — Mobile app-specific research.
- **`mockup`** — High-fidelity visual design deliverable (feature-002 `mockups/`).
- **`motor-impairment`** — Fine motor control accessibility needs specifically.
- **`nursing`** — Registered nurse population specifically.
- **`onboarding`** — First-time setup / first-run experience research and deliverables. Use this tag alone — don't also add `first-run` or `first-time-user` for the same content, per the drift note above.
- **`organizational-readiness`** — Org-wide (not unit-specific) sentiment/preparedness for change.
- **`patient-experience`** — Patient-facing (not staff-facing) experience research.
- **`persona`** — Fictional user archetype grounded in research (feature-002 `personas/` deliverable).
- **`phi`** — Protected Health Information handling, exposure, or risk.
- **`prior-auth`** — Prior authorization workflow for utilization management.
- **`privacy`** — Data privacy topics not specific to a single regulation (contrast with `hipaa`, `phi`).
- **`prototype`** — Click-through or coded prototype deliverable (feature-002 `prototypes/`, stub-only).
- **`pulse`** — A short, lightweight recurring survey instrument.
- **`q1`** — Work scoped to the first calendar quarter.
- **`readout`** — Polished, presented synthesis deliverable (feature-002 `research-readouts/`).
- **`release-of-information`** — The ROI process for releasing patient records to third parties.
- **`retro`** — Retrospective review of a completed period of work.
- **`roadmap`** — Forward-looking planning for upcoming work.
- **`rollout`** — Feature launch/rollout planning and execution.
- **`scheduling`** — Appointment scheduling workflows.
- **`section-508`** — U.S. federal accessibility compliance requirement.
- **`security`** — IT/platform security topics.
- **`sensitive-notes`** — Clinical notes requiring handling beyond standard PHI protection.
- **`service-blueprint`** — Service blueprint/topology deliverable (feature-002 `service-topology/`).
- **`sso`** — Single sign-on authentication.
- **`storyboard`** — Narrative, situational-context deliverable (feature-002 `storyboards/`).
- **`style-guide`** — Lightweight design-system subset deliverable (feature-002 `style-guide/`).
- **`survey`** — Quantitative or mixed self-report instrument, as opposed to observed/moderated sessions.
- **`thumbnails`** — Rapid, low-fidelity layout exploration deliverable (feature-002 `thumbnails/`).
- **`training`** — Staff training/education design.
- **`trust`** — General trust-in-AI attitudes not specific to documentation (contrast with `trust-in-ai`).
- **`trust-in-ai`** — Attitudes toward relying on AI-generated output.
- **`usability`** — Task-based, moderated usability testing method.
- **`user-flow`** — The sequence/logic between screens (feature-002 `user-flows/` deliverable).
- **`utilization-management`** — Utilization review/management department and workflows.
- **`v0.1`** — First formative prototype version.
- **`v0.2`** — Second iteration, post-v0.1 fixes.
- **`v1`** — First tested version of a feature (non-ambient-scribe naming).
- **`v2`** — Second tested version, post-v1 fixes.
- **`wcag`** — Web Content Accessibility Guidelines conformance specifically.
- **`wireflow`** — Flow diagram combined with screen wireframes (feature-002 `wireflows/` deliverable).
- **`wireframe`** — Structured, low-fidelity layout deliverable (feature-002 `wireframes/`).
- **`workflow`** — General clinical or administrative process/workflow research.
- **`year-end`** — Sessions conducted as part of annual review/retro cycles.
