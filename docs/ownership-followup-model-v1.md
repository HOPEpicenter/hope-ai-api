# Ownership + Follow-up Model v1

Scope:
- Integration surfaces (Phase 4): /api/integration/summary and /api/integration/timeline
- Goal: define a minimal, auditable ownership model that can expand later without breaking contracts.

## Concepts

### OwnerRef (v1)
A reference to the person/team accountable for follow-up.

Recommended shape (docs contract, not code yet):
- ownerType: "user" | "team"
- ownerId: string
- displayName?: string (optional, presentation-only)

Notes:
- ownerId is an opaque stable identifier (directory id, internal user key, team slug, etc.).
- displayName is optional and must not be relied on as an identifier.

### Follow-up state (v1)
Follow-up is a *workflow property* that can be derived from events.
For v1, define the minimum fields:

- assignedTo?: OwnerRef
- needsFollowup: boolean (already used by engagement score v1 patterns)
- followupReason?: string (optional explanation)

## Where it appears (v1)

### /api/integration/summary (recommended)
Include:
- assignedTo?: OwnerRef
- needsFollowup: boolean
- followupReason?: string

This is the canonical place for “who owns the next action”.

### /api/integration/timeline (optional for v1)
Do NOT require ownership per item.
If included later, it must be additive and must not affect ordering or cursor semantics.

## How ownership is set (v1 options)

### Option A (preferred, auditable): events
Model ownership changes as events, e.g.:
- owner.assign { assignedTo: OwnerRef }
- owner.unassign {}
- followup.mark_needed { reason }
- followup.clear {}

Pros:
- fully auditable and event-driven (matches Engagement + Formation discipline)
- easy to derive snapshot fields

### Option B (acceptable early): snapshot-only fields
Set ssignedTo only in derived snapshot for now.

Pros:
- simplest initial implementation
Cons:
- less auditable; may require migration to events later

Decision (v1):
- Prefer Option A when implementing business logic.
- Docs contract remains compatible with either approach as long as summary fields are derived and stable.

## Invariants / Non-goals

### Invariants
- Ownership must not change ordering.
- Cursor paging behavior is unchanged.
- Fields are additive; absence means “unassigned”.

### Non-goals (v1)
- SLA timers, reminders, escalations
- multi-assignee or role-based routing
- group/program membership (separate doc/task)

