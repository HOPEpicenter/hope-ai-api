# Dashboard Data Contracts v1

This document defines the minimum frontend data contracts for HOPE Dashboard v1.

Purpose:
- keep frontend scope aligned with current backend reality
- prevent UI assumptions from outrunning the API
- define the minimum data shape needed for the first dashboard pages

## Followups Page

Source:
`/ops/followups`

Minimum row shape:

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
}

UI behavior:
- assignment adds visitor
- contact keeps visitor
- outcome removes visitor

---

## Visitor Detail Page

Source composition:

- visitor
- formation profile
- integration summary
- timeline

Minimum model:

type VisitorDetailViewModel = {
  visitorId: string
  visitor?: any
  formation?: any
  integration?: any
  timeline?: any[]
}

---

## Overview Page

Purpose:
leadership snapshot.

type DashboardOverviewViewModel = {
  kpis: {
    activeFollowups: number
    recentVisitors: number
  }

  recentFollowups: FollowupRow[]
}

---

## Timeline Page

Source:
integration timeline

type TimelineItem = {
  visitorId?: string
  stream?: string
  type?: string
  occurredAt?: string
}

---

## Implementation rule

If a page needs data not defined here:

1. simplify the page
2. use mock data
3. document the gap
4. only then expand the backend
## 2026-04-02 Addendum - Visitor Detail + Formation Milestones

### Visitor Detail data contract (current shipped state)

Visitor detail is no longer only a thin visitor + formation page composition. The dashboard now treats the visitor summary endpoint as the primary truth source for summary-backed data.

Current detail consumer shape includes:
- visitor
- engagementTimeline
- formationProfile
- formationMilestones
  - hasSalvation
  - hasBaptism
  - hasMembership
- formationEvents

### Summary-backed fields now used by dashboard visitor detail

The visitor detail page consumes:
- summary.engagement.summary
- summary.engagement.timelinePreview
- summary.integration
- summary.formation.profile
- summary.formation.milestones

### Followups / visitors list note

The visitors table milestone column is hydrated from formation profile lastEventType through the dashboard formation profiles loader. The followups/visitors list path remains bulk/list-oriented and does not switch to per-row summary calls.
