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