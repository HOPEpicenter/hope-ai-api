# Dashboard Data Contracts v1

This document defines the minimum frontend data contracts for HOPE Dashboard v1.

Purpose:
- keep frontend scope aligned with current backend reality
- prevent UI assumptions from outrunning the API
- define the minimum data shape needed for the first dashboard pages

## Guardrails

- prefer current backend surfaces over new API work
- keep contracts additive
- do not require new paid infrastructure
- stay practical within the Azure grant budget
- use mock data first, then wire real APIs

---

## 1. Followups Page Contract

Primary source:
- `/ops/followups`

Minimum row shape:

```ts
type FollowupRow = {
  visitorId: string
  assignedTo?: {
    ownerType?: string
    ownerId?: string
  }
  stage?: string | null
  needsFollowup?: boolean
  resolvedForAssignment?: boolean
  lastFollowupAssignedAt?: string | null
  lastFollowupContactedAt?: string | null
  lastFollowupOutcomeAt?: string | null
}UI expectations:

show actionable assigned followups

contact does not remove a row

outcome resolves/removes a row

frontend must tolerate missing optional fields

2. Visitor Detail Page Contract

Recommended source composition:

visitor basics endpoint

formation profile

integration summary

integration timeline (recent slice)

Minimum shape:

type VisitorDetailViewModel = {
  visitorId: string

  visitor?: {
    name?: string | null
    email?: string | null
    phone?: string | null
  }

  formation?: {
    stage?: string | null
    assignedTo?: string | null
    lastEventType?: string | null
    lastEventAt?: string | null
    stageUpdatedAt?: string | null
    stageUpdatedBy?: string | null
    stageReason?: string | null
    lastFollowupAssignedAt?: string | null
    lastFollowupContactedAt?: string | null
    lastFollowupOutcomeAt?: string | null
  }

  integration?: {
    needsFollowup?: boolean
    followupReason?: string | null
    assignedTo?: {
      ownerType?: string
      ownerId?: string
    }
    sources?: {
      engagement?: boolean
      formation?: boolean
    }
    lastEngagementAt?: string | null
    lastFormationAt?: string | null
    lastIntegratedAt?: string | null
    workflows?: Array<{
      workflowId?: string
      displayName?: string
    }>
  }

  timeline?: Array<{
    stream?: string
    type?: string
    occurredAt?: string | null
    summary?: string | null
  }>
}

UI expectations:

this is the primary operator/leadership inspection page

unknown fields must be ignored safely

missing sections must degrade gracefully

3. Overview Page Contract

Overview should use simple derived cards and recent lists, not invented analytics.

Suggested view model:

type DashboardOverviewViewModel = {
  kpis: {
    activeFollowups: number
    recentVisitors: number
    recentIntegrationItems: number
  }

  recentFollowups: FollowupRow[]

  recentVisitors: Array<{
    visitorId: string
    stage?: string | null
    assignedTo?: string | null
    needsFollowup?: boolean
    lastActivityAt?: string | null
  }>

  recentTimeline: Array<{
    visitorId?: string
    stream?: string
    type?: string
    occurredAt?: string | null
  }>
}

UI expectations:

keep counts simple

do not block v1 on advanced analytics

prefer clarity over dense metrics

4. Timeline Page Contract

Primary source:

integration timeline

Minimum item shape:

type TimelineItem = {
  visitorId?: string
  stream?: string
  type?: string
  occurredAt?: string | null
  summary?: string | null
}

UI expectations:

read-only in v1

simple filtering later if needed

no custom state machine in frontend

5. Implementation rule

If a page needs data not covered by these contracts, do this in order:

simplify the page

use mock data temporarily

document the gap

only then consider backend/API expansion

Do not widen backend scope first unless a real dashboard blocker is identified.