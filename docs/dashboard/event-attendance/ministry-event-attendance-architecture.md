# HOPE Dashboard — Ministry Event and Attendance Architecture

## Purpose

Define the Ministry Event and Attendance architecture for the clean HOPE Dashboard.

The event and attendance layer should help ministry teams understand worship participation, service attendance, ministry event engagement, volunteer participation, and event-driven care opportunities across the ministry operating system.

The system should answer:

> Who participated, what happened, what ministry context matters, and how should attendance inform care, formation, and follow-up?

---

## Core Principle

Attendance is not raw presence tracking.

It is canonical ministry participation context.

The system exists to preserve accurate participation history, event context, engagement continuity, and care opportunities without reducing people to attendance numbers.

The backend owns canonical event semantics, attendance identity, check-in continuity, participation projections, and replay-safe attendance calculations.

The frontend presents attendance context with pastoral clarity.

---

## Experience Philosophy

The event and attendance experience should reflect:

> A pastor’s heart with an engineer’s brain.

The experience should feel:

- trustworthy,
- contextual,
- explainable,
- ministry-aware,
- calm,
- and human-centered.

Attendance should help ministry teams notice people and care well, not merely count bodies.

---

## Human Authority

Pastors and ministry leaders remain the final authority regarding:

- ministry interpretation,
- care response,
- pastoral follow-up,
- event significance,
- and engagement meaning.

The system may assist visibility and coordination but must not replace ministry discernment.

---

## Canonical Backend Ownership

The backend must own:

- event identity
- attendance identity
- check-in semantics
- participation state
- service/event linkage
- attendance confidence
- replay-safe attendance projections
- deterministic participation ordering
- attendance timeline identity
- event-driven follow-up triggers
- engagement calculation inputs

The frontend must not invent attendance truth models.

---

## Event Domains

The event and attendance architecture may support:

- worship services
- first-time visitor check-ins
- ministry events
- small groups
- formation classes
- volunteer serving
- care events
- outreach events
- prayer gatherings
- leadership meetings
- youth or family ministry events

---

## Attendance Semantics

Attendance records should preserve:

- person identity
- household context when relevant
- event identity
- event type
- timestamp
- source
- confidence
- check-in method
- related ministry context
- participation meaning

Attendance semantics must remain backend-governed and explainable.

---

## Participation Context

Participation context may include:

- attended worship
- served on a team
- joined a group
- attended formation class
- checked in a child
- participated in outreach
- attended care meeting
- engaged with prayer gathering

Participation should be interpreted pastorally, not mechanically.

---

## Timeline Integration

Attendance and event activity should integrate directly with:

- Unified Timeline
- Visitor Detail
- FollowUp Intelligence
- Formation Journey Visualization
- Operational Insights
- Ministry Communication
- Identity and Household Architecture

Attendance should appear as canonical ministry story events.

---

## FollowUp Integration

Attendance may influence follow-up by identifying:

- first-time guests
- return visitors
- missed attendance patterns
- reconnect opportunities
- milestone attendance
- care opportunities
- formation next steps
- volunteer engagement opportunities

The backend must own canonical follow-up impact semantics.

---

## Formation Integration

Attendance may contribute to formation visibility through:

- pathway participation
- group involvement
- serving engagement
- class attendance
- milestone progress
- spiritual formation opportunities

The frontend must not independently convert attendance into formation state.

---

## Explainability

Attendance insights should answer:

- What event was attended?
- How was attendance recorded?
- What confidence exists?
- What ministry context matters?
- What follow-up or formation impact exists?
- What timeline event was created?

Users should understand why attendance matters.

---

## Pastoral Language

Attendance language should remain:

- human,
- contextual,
- respectful,
- explainable,
- and ministry-centered.

Prefer:

- Attended worship
- Checked in for service
- Joined formation class
- Served with hospitality team
- Returned after several weeks away
- Participated in group gathering

Avoid:

- Attendance object captured
- Engagement datapoint registered
- Presence compliance
- User retention signal
- Behavioral participation metric

---

## Sensitive Interpretation Boundaries

The system must not:

- equate attendance with spiritual health
- shame absence
- assign spiritual worth
- silently infer care concerns
- create hidden attendance scoring
- replace pastoral discernment

Attendance should inform care, not judge people.

---

## AI Integration

Pastoral AI surfaces may assist by:

- summarizing attendance patterns
- identifying reconnect opportunities
- preparing ministry briefings
- explaining event context
- surfacing formation opportunities

AI guidance must remain bounded by canonical backend attendance semantics.

---

## Empty States

If no attendance data exists, the dashboard should communicate:

> No event or attendance history is currently available.

The experience should remain calm and non-judgmental.

---

## Guardrails

Event and attendance architecture must remain:

- backend-governed
- explainable
- replay-safe
- auditable
- deterministic
- pastorally readable
- human-authority preserving
- thin-client friendly

The frontend must never become the canonical attendance interpretation engine.

---

## Operational Trust

Ministry teams should trust that:

- attendance history is accurate,
- event linkage is canonical,
- check-in state is reliable,
- participation context is explainable,
- and attendance projections reflect backend truth.

Trust matters more than attendance visualization complexity.

---

## Experience Standard

Ministry Event and Attendance Architecture should feel like a trusted participation context system helping ministry teams understand who is engaging, where people are connecting, and what care or formation opportunities may follow.

The system should help ministry teams:

- notice people,
- understand participation,
- coordinate follow-up,
- support formation,
- identify reconnect opportunities,
- and care for people without reducing them to attendance patterns.
