# HOPE Dashboard — Ministry Workflow Orchestration

## Purpose

Define the ministry workflow orchestration architecture for the clean HOPE Dashboard.

The orchestration layer should help ministry teams coordinate care, follow-up, formation, and engagement workflows without losing the human and pastoral nature of ministry.

The system should answer:

> What should happen next, who should do it, when should it happen, and how do we coordinate ministry care responsibly?

---

## Core Principle

Workflow orchestration is not business process automation.

It is coordinated ministry care.

The orchestration system exists to support people caring for people.

The backend owns canonical orchestration semantics, workflow state, and coordination rules.

The frontend presents workflow context with pastoral clarity.

---

## Experience Philosophy

The orchestration experience should reflect:

> A pastor’s heart with an engineer’s brain.

The system should feel:

- calm,
- trustworthy,
- coordinated,
- explainable,
- actionable,
- and ministry-aware.

The dashboard should reduce ministry friction without reducing people to operational objects.

---

## Primary Questions

The orchestration layer must answer:

1. What ministry action should happen next?
2. Why is this action needed?
3. Who owns the action?
4. When should it happen?
5. What already happened?
6. What dependencies exist?
7. What care risks exist if no action occurs?
8. Can we trust the workflow state?

---

## Canonical Backend Ownership

The backend must own:

- workflow state
- orchestration rules
- assignment semantics
- escalation semantics
- sequencing logic
- dependency resolution
- replay-safe workflow projection
- deterministic workflow transitions
- canonical workflow identity
- workflow audit history

The frontend must not reconstruct canonical workflow meaning.

---

## Workflow Domains

Workflow orchestration may coordinate:

- visitor onboarding
- first-time guest follow-up
- pastoral outreach
- prayer request care
- formation progression
- volunteer engagement
- reconnect workflows
- escalation workflows
- event-driven follow-up
- care assignment routing
- ministry handoffs

---

## Workflow States

Workflow states must be:

- deterministic,
- explainable,
- replay-safe,
- backend-calculated,
- and pastorally understandable.

Example states:

- Pending
- Assigned
- In Progress
- Waiting
- Escalated
- Completed
- Closed

The frontend must not invent workflow state semantics.

---

## Assignment Model

Assignments may target:

- pastors
- follow-up coordinators
- ministry leaders
- volunteers
- care teams
- formation leaders

Assignments should clarify:

- ownership,
- responsibility,
- urgency,
- and expected next action.

The system should avoid ambiguous ownership.

---

## Escalation Model

Escalations should exist for:

- urgent care needs
- missed follow-ups
- pastoral intervention
- safety-sensitive situations
- prolonged inactivity
- stalled workflows

Escalations should remain pastorally sensitive and operationally clear.

---

## Workflow Explainability

Users should always understand:

- why a workflow exists,
- how it was triggered,
- what events influenced it,
- what actions are pending,
- and what happens next.

The orchestration layer must never become opaque.

---

## Timeline Integration

Workflow orchestration should integrate directly with:

- Unified Timeline
- Visitor Detail
- FollowUp Intelligence
- Formation Experience
- Care workflows
- Navigation architecture

Workflow actions should always connect to canonical ministry story context.

---

## Human Authority

The orchestration system assists ministry coordination.

It does not replace pastoral judgment.

Pastors and ministry leaders remain the final authority over ministry decisions, care actions, and workflow outcomes.

Automation should support discernment, not replace it.

---

## Notifications and Attention

Workflow orchestration may drive:

- reminders
- assignment notifications
- escalation alerts
- overdue indicators
- coordination prompts
- workflow summaries

Attention systems should feel supportive rather than overwhelming.

---

## Empty States

If no workflows require action, the dashboard should communicate:

> No ministry workflows currently need attention.

The experience should reinforce confidence and operational calm.

---

## Guardrails

The orchestration architecture must remain:

- backend-governed
- deterministic
- replay-safe
- explainable
- auditable
- pastorally readable
- role-aware
- thin-client friendly

The frontend must never become the canonical workflow engine.

---

## Operational Trust

Ministry teams should trust that:

- workflows are accurate,
- assignments are current,
- escalation logic is reliable,
- orchestration history is auditable,
- and workflow state reflects canonical backend truth.

Trust is more important than workflow complexity.

---

## Experience Standard

The orchestration layer should feel like a trusted ministry coordination system helping teams care for people intentionally and consistently.

The system should help ministry teams:

- coordinate better,
- respond faster,
- reduce dropped follow-up,
- maintain operational clarity,
- and preserve pastoral care quality at scale.
