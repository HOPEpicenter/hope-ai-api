# HOPE Dashboard — Unified Timeline Experience

## Purpose

Define the unified timeline experience for the clean HOPE Dashboard.

The timeline should help pastors and follow-up teams understand a person’s ministry journey over time without reconstructing meaning in the frontend.

The page should answer:

> What has happened in this person’s journey, what does it mean, and what care should happen next?

---

## Core Principle

The timeline is not an activity feed.

It is a canonical ministry story.

The backend owns ordering, meaning, source, and event semantics.

The dashboard presents those events with pastoral clarity.

---

## Experience Philosophy

The timeline should follow the dashboard philosophy:

> A pastor’s heart with an engineer’s brain.

One person.

One story.

One journey.

---

## Primary Questions

The unified timeline must answer:

1. What happened?
2. When did it happen?
3. Why does it matter?
4. What journey moment does it belong to?
5. What care action followed?
6. What should happen next?
7. Can this event be trusted?

---

## Timeline Sources

Timeline events may include:

- visitor creation
- worship check-ins
- follow-up creation
- follow-up outcomes
- formation milestones
- pastoral notes
- prayer requests
- care assignments
- integration-sourced events
- engagement changes
- lifecycle transitions

---

## Canonical Backend Ownership

The backend must own:

- event identity
- event type
- event timestamp
- canonical ordering
- source attribution
- event meaning
- lifecycle impact
- follow-up impact
- formation impact
- replay-safe event projection

The frontend must not infer or reconstruct canonical timeline meaning.

---

## Display Model

Each timeline item should show:

- human-readable title
- short pastoral summary
- timestamp
- source
- related owner or team member
- journey context
- care significance
- trust / verification indicator when needed

---

## Visual Grouping

Allowed grouping:

- by day
- by service
- by journey stage
- by formation milestone
- by care episode

Not allowed:

- frontend-created chronology rules
- client-side lifecycle reconstruction
- alternate event interpretations
- hidden sorting that disagrees with backend order

---

## Pastoral Language

Timeline copy should use human ministry language.

Prefer:

- Checked in for worship
- Sarah completed a follow-up call
- Moved into early connection
- Prayer request added
- Joined a formation pathway

Avoid:

- Record updated
- Status mutation
- Lifecycle object changed
- Integration payload received

---

## Empty State

If no timeline events exist, the dashboard should say:

> No ministry journey events have been recorded yet.

The empty state should invite the team to begin care, not imply failure.

---

## Guardrails

The unified timeline must remain:

- backend-governed
- replay-safe
- deterministic
- auditable
- pastorally readable
- thin-client friendly

---

## Experience Standard

The timeline should feel like reading the person’s ministry story, not inspecting a database log.

The user should leave with confidence about:

- what happened,
- what matters,
- what care has already occurred,
- and what should happen next.
