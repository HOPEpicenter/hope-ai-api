# Dashboard MVP backend contract plan — 2026-06-23

## Purpose

Define the first new-dashboard MVP against the certified backend surfaces without reviving brittle old-dashboard work or introducing frontend-owned lifecycle logic.

This plan follows the 2026-06-23 pilot readiness certification and keeps backend behavior unchanged.

## Current backend status

Backend pilot readiness certification is complete.

Certified staging validation includes:

- Auth scoping
- Activity intelligence
- Opportunity worklists
- OPS task-preview simulation validation
- OPS preview latency diagnostics
- TypeScript build and diff checks

Known non-blocking risk:

- OPS task-preview latency is slow on staging and remains monitor/deferred unless it blocks pilot usage.

## Dashboard MVP principle

The dashboard must stay thin.

The frontend should display backend-owned read models and should not recompute:

- engagement state
- follow-up state
- formation stage
- journey progression
- opportunity segment membership
- care/candidate status
- task-preview readiness logic

## MVP surfaces

### Today cockpit

Use:

- `GET /api/activity-intelligence`
- `GET /api/dashboard/followups`
- `GET /api/ops/task-preview-summary`

Purpose:

- ministry health snapshot
- follow-up pressure
- opportunity/care signals
- read-only task-preview summary

Do not use task-preview simulation as a default page-load dependency.

### People / visitor list

Use:

- `GET /api/visitors`
- `GET /api/formation/profiles`
- `GET /api/dashboard/followups`

Purpose:

- people list
- stage/formation indicators
- follow-up/care indicators
- owner/assignment visibility where backend surfaces it

### Visitor detail

Use:

- `GET /api/visitors/{id}/summary`
- `GET /api/visitors/{visitorId}/journey`
- `GET /api/visitors/{id}/dashboard-card`
- `GET /api/visitors/{id}/activity-insights`
- `GET /api/visitors/{id}/formation/profile`
- `GET /api/visitors/{id}/formation/events`

Purpose:

- one-person story
- timeline/journey context
- formation profile
- latest activity
- next pastoral action context

### Opportunity worklists

Use:

- `GET /api/activity-intelligence/opportunities/{segment}/worklist`

Supported initial segments:

- `connected-without-next-step`
- `next-step-selected-not-completed`
- `active-care-without-outcome`
- `connected-without-care-owner`

Purpose:

- segment-specific person-level ministry opportunity lists
- backend-authored narrative, evidence, recommended action, and resolution metadata

### Care queue

Use:

- `GET /api/care/candidates`
- `GET /api/care/summary`
- `GET /api/care/export`

Purpose:

- care candidate visibility
- queue summary
- export/reporting path

Initial MVP should avoid widening assignment workflows unless explicitly opened.

## Explicit non-goals

This MVP planning slice does not open:

- assignment workflow implementation
- care-plan workflow implementation
- persistence activation
- orchestration activation
- old-dashboard repair
- frontend-owned derivation logic
- task execution or write automation

## First dashboard build order

1. Today cockpit shell backed by certified read surfaces.
2. People list backed by visitors, formation profiles, and dashboard followups.
3. Visitor detail backed by visitor summary, dashboard card, journey, and activity insights.
4. Opportunity segment worklist pages.
5. Care queue visibility.

## Open decisions before dashboard implementation

- Which dashboard repository/branch will host the rebuild.
- Whether task-preview summary appears in the first cockpit or remains ops-only.
- Whether care assignment commands stay hidden for MVP or are exposed after a separate workflow decision.
- Whether latency remediation is required before exposing task-preview summary broadly.

## Decision

Backend is ready for dashboard MVP planning.

Next implementation should happen in the new dashboard path, with backend surfaces treated as canonical and no old-dashboard fixes unless they unblock pilot validation.
