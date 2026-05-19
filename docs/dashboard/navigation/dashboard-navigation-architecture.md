# HOPE Dashboard — Navigation Architecture

## Purpose

Define the navigation architecture for the clean HOPE Dashboard.

The dashboard should help pastors and ministry teams move through the ministry operating system with clarity, confidence, and pastoral focus.

Navigation should make it easy to answer:

> Where do I go to understand people, care needs, ministry activity, and next actions?

---

## Core Principle

Dashboard navigation is not an app menu.

It is a ministry workspace map.

The navigation model should reflect how pastors and ministry teams think about care, not how database entities are stored.

---

## Experience Philosophy

The dashboard should feel like:

> A pastor’s heart with an engineer’s brain.

Navigation should be:

- calm,
- obvious,
- ministry-centered,
- role-aware,
- and action-oriented.

The user should always know:

- where they are,
- what they are looking at,
- what matters next,
- and how to move to the next ministry action.

---

## Primary Navigation Areas

The clean dashboard should organize around ministry work areas:

1. Home
2. People
3. FollowUp
4. Timeline
5. Formation
6. Care
7. Insights
8. Settings

These areas may evolve, but they should remain pastorally understandable.

---

## Home

Home should answer:

- What needs attention today?
- Who needs care?
- What follow-up is urgent?
- What changed recently?
- What should I do next?

Home is the ministry command center, not a generic dashboard.

---

## People

People should provide access to:

- visitors
- members
- families
- assigned care lists
- search
- filtered ministry segments

People pages should lead naturally into Visitor Detail and person-centered ministry stories.

---

## FollowUp

FollowUp should provide access to:

- open follow-ups
- overdue follow-ups
- assigned care work
- recommended next actions
- FollowUp Intelligence
- follow-up history

FollowUp navigation should prioritize care work that needs action.

---

## Timeline

Timeline should provide access to:

- unified ministry events
- person-specific timelines
- church-wide activity streams
- service-related events
- formation and care milestones

Timeline navigation must preserve canonical backend ordering and semantics.

The frontend must not create alternate timeline meaning.

---

## Formation

Formation should provide access to:

- pathways
- milestones
- next steps
- participation
- growth journey context
- formation progress

Formation navigation should help leaders see discipleship movement, not just program attendance.

---

## Care

Care should provide access to:

- pastoral care needs
- prayer requests
- care assignments
- escalations
- sensitive follow-up contexts
- care history

Care navigation should be calm, confidential, and ministry-sensitive.

---

## Insights

Insights should provide access to:

- ministry health indicators
- engagement patterns
- follow-up trends
- formation movement
- care workload
- operational trust signals

Insights should explain ministry reality without reducing people to metrics.

---

## Settings

Settings should provide access to:

- team configuration
- roles and permissions
- integrations
- canonical contract configuration
- ministry workflow preferences
- administrative tools

Settings should not become the home for ordinary ministry work.

---

## Visitor-Centered Navigation

Navigation should support the core pattern:

> one person, one story, one journey.

From any person-related surface, the user should be able to move naturally to:

- Visitor Detail
- Unified Timeline
- FollowUp history
- Formation context
- Care notes
- recommended next action

---

## Role Awareness

Navigation may adapt by role:

- pastor
- follow-up coordinator
- ministry leader
- admin
- volunteer
- care team member

Role-aware navigation should simplify the experience without hiding canonical truth from authorized users.

---

## Deep Linking

The dashboard should support stable deep links to:

- visitor detail
- timeline views
- follow-up items
- formation milestones
- care contexts
- filtered work queues

Deep links must point to canonical backend identities and contracts.

---

## State and Routing Guardrails

The frontend may own:

- route state
- selected tabs
- filters
- search inputs
- layout preferences

The frontend must not own:

- lifecycle state
- canonical follow-up state
- canonical engagement state
- canonical formation state
- canonical timeline ordering
- canonical intelligence semantics

---

## Empty States

Navigation empty states should guide ministry action.

Prefer:

> No follow-ups need attention right now.

Avoid:

> No records found.

Empty states should preserve dignity and pastoral context.

---

## Mobile Navigation

Mobile navigation should prioritize:

- today’s care needs
- person search
- follow-up action
- visitor detail
- timeline context

Mobile should not attempt to expose every desktop surface equally.

---

## Guardrails

The navigation architecture must remain:

- pastorally understandable
- backend-governed
- contract-driven
- role-aware
- thin-client friendly
- stable under future dashboard rebuilds

Navigation should never encourage frontend reconstruction of canonical backend meaning.

---

## Experience Standard

The user should feel oriented, not overloaded.

The dashboard should help ministry teams move from awareness to care action with as little friction as possible.

Navigation exists to help people care for people.
