# OPS Followups Workflow v1

This document explains how the followups queue behaves from an operator perspective.

This complements the technical contract defined in:
`docs/ops-followups-consumer-contract-v1.md`.

---

# Overview

The followups queue is derived from **formation events**.

Operators do not modify the queue directly.

Instead:

events -> formation profile -> followups queue

Queue entries appear and disappear automatically based on events.

---

# Workflow

## 1. Assignment

Event recorded:

FOLLOWUP_ASSIGNED

Effects:

- formation profile updates:
  - `assignedTo`
  - `lastFollowupAssignedAt`
  - `stage`
- visitor appears in:
  - `/ops/followups`

Purpose:

The visitor now requires followup from the assigned operator.

---

## 2. Contact attempt

Event recorded:

FOLLOWUP_CONTACTED

Effects:

- formation profile updates:
  - `lastFollowupContactedAt`

Queue behavior:

- visitor **remains in the followups queue**

Reason:

Contact does not resolve the assignment.

---

## 3. Followup outcome recorded

Event recorded:

FOLLOWUP_OUTCOME_RECORDED

Effects:

- formation profile updates:
  - `lastFollowupOutcomeAt`

Queue behavior:

- visitor **disappears from `/ops/followups`**

Reason:

The assignment is considered resolved.

---

# Queue visibility rules

A visitor appears in `/ops/followups` when:

- `assignedTo` exists
- `resolvedForAssignment = false`

A visitor disappears when:

- a followup outcome resolves the current assignment

---

# Operator mental model

The queue answers one question:

Which assigned visitors still require followup attention?

Operators should treat:

- presence in queue = actionable
- absence from queue = resolved for this assignment

---

# Non-goals for v1

The queue intentionally does not implement:

- reminders
- SLA timers
- escalation rules
- multi-assignee routing
- permission models
- workflow automation

These may be added later only if a real operator need emerges.

---

# Design principle

The followups queue is **derived state**.

Operators do not mutate the queue directly.

All queue behavior is driven by **formation events**.