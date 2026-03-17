# HOPE Dashboard v1 Build Plan

## Purpose

Dashboard v1 is a private leadership and operations dashboard for:

- visitor visibility
- follow-up accountability
- formation visibility
- integration insight

It should be built around the backend surfaces that already exist and are already hardened.

## Budget / hosting guardrail

All dashboard decisions should respect this constraint:

- prefer services covered by the Azure grant
- keep the solution practical within the current Azure grant budget
- avoid unnecessary recurring third-party spend
- prefer mock-first and incremental rollout before adding paid infrastructure

This means v1 should:

- use the existing HOPE API as the main backend
- avoid introducing new paid vendors unless clearly necessary
- avoid real-time/event-stream infrastructure unless a real need appears
- favor simple deployment and low-cost Azure-aligned hosting choices

## Scope for v1

Ship only these surfaces:

1. Overview
2. Follow-Ups
3. Visitors
4. Visitor Detail
5. Timeline

Do not make these part of v1:

- attendance module
- teams coverage
- serving/scheduling
- advanced discipleship lesson tracking
- workflow automation
- reminders/escalations
- journey-step engine
- any endpoint that does not already exist or is not clearly required

## Route plan

```text
/app
  /layout.tsx
  /page.tsx
  /overview/page.tsx
  /followups/page.tsx
  /visitors/page.tsx
  /visitors/[visitorId]/page.tsx
  /timeline/page.tsx
  /components/*
  /lib/api/*
  /lib/mocks/*
  /types/*Page responsibilities
/overview

Purpose:

leadership snapshot

simple operational awareness

Use current backend-backed concepts only:

active follow-ups

recent visitors

recent integration activity

simple KPI cards derived from existing data

Do not depend on future-only analytics endpoints.

/followups

Purpose:

operational queue for active follow-up work

Primary backend surface:

/ops/followups

Fields to use:

visitorId

assignedTo

stage

needsFollowup

lastFollowupAssignedAt

lastFollowupContactedAt

lastFollowupOutcomeAt

resolvedForAssignment (if present in response shaping)

Behavior assumptions:

assigned visitors appear

contact does not remove them

outcome resolves/removes them

/visitors

Purpose:

recent/searchable visitor list

Use:

existing visitors API

light derived display fields only where already available

Suggested columns:

visitorId or display identity

stage

assignedTo

needsFollowup

last activity timestamp

/visitors/[visitorId]

Purpose:

single visitor command view

This is the most important page in v1.

Combine:

visitor basics

formation profile

integration summary

timeline slice

Suggested sections:

visitor header

formation status card

follow-up status card

integration summary card

recent timeline/events

/timeline

Purpose:

cross-stream activity inspection

Use:

integration timeline

Keep this page read-only in v1.

Backend/API alignment

Dashboard v1 should only assume data from current hardened backend surfaces.

Preferred current sources:

visitors

formation profile

formation events

integration summary

integration timeline

ops followups

If a page cannot be built from current surfaces, the default answer is:

simplify the page

use mock data temporarily

or defer the feature

Do not add backend scope first unless a real consumer blocker exists.

Build sequence
Phase A - docs + mocks

finalize Dashboard v1 scope

create typed mock data

build static page shells

confirm navigation and layout

Phase B - operational surfaces first

build /followups

build /visitors/[visitorId]

build /overview

build /timeline

build /visitors

Phase C - real API wiring

add a thin API client layer

replace mocks page-by-page

keep graceful fallback/loading/error states

avoid overbuilding global state

Suggested frontend architecture

Recommended:

Next.js App Router

TypeScript

small typed API client wrappers

component-first layout

mock-driven UI development first

Avoid early:

large client-side state frameworks

realtime subscriptions

heavy analytics tooling

broad auth/role complexity before screens are proven

Design principle

The dashboard should reflect the architecture already established in the backend:

events -> projections -> operational views

That means:

the dashboard reads derived state

the dashboard should not invent its own state model

workflow behavior should come from backend events/projections, not frontend assumptions

Deferred items

These are explicitly deferred until a real need is proven:

attendance dashboards

team coverage analytics

phase-by-phase discipleship curriculum UI

reminders/escalations

workflow automation

multi-assignee queue behavior

group/program/workflow expansion in UI beyond current backend support

Delivery rule

For the current delivery window:

prefer the smallest useful dashboard

use the backend that already exists

stay inside Azure-grant-conscious architecture decisions

only expand backend/API scope when a real dashboard blocker appears
## 2026-03-17 — Closeout status

Dashboard v1 build plan status: COMPLETE / RELEASE-READY

Completed shipped surfaces:
- Overview
- Follow-Ups
- Visitors
- Visitor Detail
- Timeline

Closeout note:
- v1 was completed using the existing hardened backend surfaces
- deferred items remain deferred
- future work should be treated as post-v1 scope unless a real blocker appears
