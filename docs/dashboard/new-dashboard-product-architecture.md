# HOPE New Dashboard Product Architecture

## North Star

Build a clean new HOPE Dashboard that helps pastors, follow-up teams, and ops leaders see people clearly, understand their story, and take the next best pastoral action.

The dashboard should feel like:

> A pastor’s heart with an engineer’s brain.

## Core Rule

Backend owns truth. Dashboard is a thin pastoral/operator surface.

Use the old dashboard only as reference. Do not carry forward old dashboard architecture, fallback logic, client-side canonical derivation, or legacy queue assumptions.

## Keep From Old Dashboard

- Useful workflow ideas
- Helpful labels and microcopy
- Operator-friendly filters
- Timeline readability ideas
- Visitor detail layout lessons
- Follow-up action flow lessons

## Replace

- Client-side lifecycle derivation
- UI-owned canonical meaning
- Legacy fallback routes
- Direct table assumptions
- Old followup queue semantics

## Primary Dashboard Pages

1. Today — Ministry Cockpit
2. FollowUps
3. Visitors
4. Visitor Detail
5. Formation & Milestones
6. FollowUp Intelligence
7. Timeline
8. Reports
9. Settings / Ops

## Today View — Ministry Cockpit

Purpose:

> Who needs care today, why, and what should I do next?

Main sections:

- Global header
- Left navigation
- Top care metrics
- Today’s FollowUps Queue
- Heart-First Pastoral Guidance
- Visitor Snapshot Panel

## Today Metrics

- Needs care today
- Waiting too long
- Need personal touch
- Waiting for owner
- Cared for today

## FollowUps Queue Card

Each row/card should show:

- Visitor name
- visitorId
- Follow-up reason
- Last engagement
- Formation stage
- Assigned owner
- Urgency
- Priority
- Aging
- Recommended next action
- State verified indicator

Primary action:

> Care for this person

Secondary actions:

- Text
- Call
- Email
- Assign
- Snooze
- Mark as cared for

## Heart-First Pastoral Guidance

Selected visitor panel should include:

- Pastoral Intent
- Human Touch Prompt
- Pastoral Reasoning
- Suggested HeartFirst Script
- Copy / Send / Mark as cared for actions

## Visitor Snapshot Panel

Show:

- Identity
- Current care state
- Engagement snapshot
- Formation snapshot
- Integration snapshot
- State verified / sync health

## Canonical Backend Contract Mapping

Today View should consume backend-owned canonical surfaces only.

Expected surfaces:

- /api/dashboard/followups
- /api/formation/profiles
- /api/visitors/:id/dashboard-card
- /api/visitors/:id/summary
- /api/dashboard/timeline/unified

Do not use:

- followup-queue2
- client-side canonical derivation
- direct table scans
- old fallback queue semantics
- /ops/followups for product dashboard needs

## Product Principle

The dashboard should help pastors say:

> This helps me see my people, not just my data.

## Non-Negotiables

- Backend owns truth
- Dashboard is thin
- visitorId anchors person-centered data
- UI language is pastoral
- No old dashboard logic resurrection
- No client-side canonical state reconstruction
- No premature redesign beyond the clean new dashboard foundation
