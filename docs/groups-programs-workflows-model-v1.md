# Groups + Programs + Workflows Model v1

Scope:
- Phase 4 Integration surfaces: /api/integration/summary (primary), /api/integration/timeline (secondary)
- Goal: define a minimal, auditable way to connect people (visitors) to groups/programs/workflows without breaking existing contracts.

## Concepts (v1)

### GroupRef
A stable identifier for a group (small group, cohort, class, ministry team, etc.)

Recommended shape (docs contract, not code yet):
- groupId: string
- displayName?: string

### ProgramRef
A stable identifier for a program (course, pathway, event-series, onboarding track, etc.)

Recommended shape:
- programId: string
- displayName?: string

### WorkflowRef
A stable identifier for an operational workflow (follow-up pipeline, assimilation steps, pastoral care flow)

Recommended shape:
- workflowId: string
- displayName?: string

## Where it appears (v1)

### /api/integration/summary (recommended canonical snapshot)
Include additive, read-only fields:
- groups?: GroupRef[]
- programs?: ProgramRef[]
- workflows?: WorkflowRef[]

Rules:
- Absence means unknown/unset (not necessarily none).
- These fields must not affect ordering or cursor semantics.

### /api/integration/timeline (optional)
Do NOT require group/program/workflow per item.
If added later, it should be additive metadata and must not change paging behavior.

## How membership/association is set (v1 options)

### Option A (preferred, auditable): events
Represent changes as events (recommended direction):
- group.join { groupId }
- group.leave { groupId }
- program.enroll { programId }
- program.complete { programId }
- workflow.enter { workflowId }
- workflow.exit { workflowId }

Pros:
- consistent with event-driven discipline (Engagement + Formation)
- easy to derive summary snapshot

### Option B (acceptable early): snapshot-only fields
Populate groups/programs/workflows only in derived snapshot for now.

Pros:
- simplest initial implementation
Cons:
- less auditable; may need migration to events later

Decision (v1):
- Prefer Option A when implementing business logic.
- Docs contract remains compatible with either approach as long as snapshot fields are stable and additive.

## Invariants / Non-goals

### Invariants
- Must not affect ordering.
- Must not affect cursor behavior.
- Additive only; existing clients unaffected.

### Non-goals (v1)
- permissions/ACL for group membership visibility
- role-based membership (leader vs participant)
- automation rules (routing, escalations)

