# HOPE Dashboard — Canonical Event Taxonomy Architecture

## Purpose

Define the Canonical Event Taxonomy architecture for the clean HOPE Dashboard and backend ministry operating system.

The canonical event taxonomy should establish the shared semantic spine for ministry activity, visitor story continuity, timeline interpretation, workflow orchestration, operational projections, AI explanations, and replay-safe backend behavior.

The system should answer:

> What happened, what does it mean, where does it belong in the ministry story, and what should the backend project from it?

---

## Core Principle

Events are not just activity records.

They are canonical ministry meaning.

The backend owns event semantics, event categories, event ordering, lifecycle interpretation, replay-safe projections, and cross-domain consistency.

The frontend presents event meaning with pastoral clarity.

The dashboard must never reconstruct canonical meaning from raw activity fragments.

---

## Experience Philosophy

The canonical event taxonomy should reflect:

> A pastor’s heart with an engineer’s brain.

The experience should help ministry teams understand:

- one person,
- one story,
- one journey,
- with clear operational meaning,
- and faithful pastoral context.

Events should feel like a coherent ministry narrative, not a technical audit stream.

---

## Canonical Backend Ownership

The backend must own:

- event type definitions
- event category definitions
- event lifecycle semantics
- event ordering rules
- event visibility rules
- event actor semantics
- event subject semantics
- event source semantics
- event status semantics
- event replay interpretation
- event-to-projection mapping
- event-to-workflow trigger mapping
- event-to-timeline rendering contracts
- event-to-AI explanation boundaries

The frontend must not infer canonical meaning from string labels, timestamps, payload shapes, or UI state.

---

## Event Taxonomy Goals

The taxonomy exists to make ministry operations:

- consistent,
- explainable,
- replay-safe,
- pastorally readable,
- thin-client friendly,
- AI-safe,
- audit-ready,
- and projection-safe.

Every major ministry surface should be able to depend on the taxonomy without rebuilding its own interpretation layer.

---

## Event Meaning Layers

Each canonical event may include meaning across several layers:

### Event Identity

What specific kind of event occurred.

Examples:

- visitor.created
- visitor.updated
- followUp.assigned
- followUp.completed
- note.added
- prayer.requested
- care.escalated
- household.linked
- group.joined
- serving.interestCaptured
- communication.sent
- attendance.recorded

### Event Category

The ministry domain the event belongs to.

Examples:

- visitor
- follow-up
- formation
- care
- prayer
- household
- communication
- group
- serving
- event-attendance
- permissions
- system

### Event Meaning

The pastoral and operational meaning the event carries.

Examples:

- a person entered the ministry story
- a relationship changed
- care attention is needed
- a next step was offered
- a ministry touchpoint occurred
- a sensitive context was protected
- a workflow advanced

### Event Projection

The deterministic backend effect the event may produce.

Examples:

- timeline item
- visitor summary update
- follow-up queue change
- care queue entry
- operational insight
- narrative rollup
- AI guidance context
- audit trail entry

---

## Event Category Model

Canonical event categories should be stable backend concepts.

Possible categories include:

- Visitor Identity
- Household and Relationships
- Follow-Up and Connection
- Formation Journey
- Event Attendance
- Communication
- Notes and Narrative
- Care and Prayer
- Groups and Community
- Volunteer and Serving
- Permissions and Trust
- Operational Insight
- System and Audit

Categories should be understandable to ministry leaders and stable enough to power backend contracts.

Frontend navigation may group or display these categories differently, but it must not redefine canonical categories.

---

## Event Type Model

Canonical event types should be:

- explicit,
- versionable,
- backend-owned,
- semantically stable,
- and safe for deterministic replay.

Event type names should describe ministry meaning rather than implementation details.

Prefer:

- visitor.created
- followUp.assigned
- care.needIdentified
- prayer.requestReceived
- group.membershipStarted
- serving.interestCaptured
- communication.touchpointRecorded

Avoid:

- db.rowInserted
- modal.submitted
- formPayloadSaved
- webhookPayloadReceived
- buttonClicked
- uiStateChanged

Implementation events may exist internally, but canonical ministry projections should depend on ministry-semantic events.

---

## Event Actor Semantics

The backend should represent who or what caused an event.

Actors may include:

- visitor
- staff user
- pastor
- volunteer
- care team member
- system automation
- imported source
- AI-assisted process

Actor semantics must remain explainable.

The frontend should display actor context only through backend-provided contracts.

---

## Event Subject Semantics

The backend should represent who or what the event is about.

Subjects may include:

- person
- household
- follow-up task
- care request
- prayer request
- group
- serving opportunity
- event attendance record
- communication thread
- permission grant

Subject references should preserve canonical identity rules.

The event taxonomy must support one person, one story, one journey without fragmenting identity across domains.

---

## Event Source Semantics

The backend should preserve where an event originated.

Sources may include:

- admin action
- public form submission
- follow-up workflow
- communication workflow
- event attendance import
- care team workflow
- group workflow
- serving workflow
- system reconciliation
- trusted integration

Source context should support auditability without making the dashboard feel technical.

---

## Event Status Semantics

Events may carry canonical status meaning when appropriate.

Examples:

- recorded
- pending
- completed
- corrected
- superseded
- restricted
- failed
- replayed
- ignored

Status semantics must be backend-defined.

The frontend should not infer lifecycle state from partial payloads.

---

## Ordering and Replay Safety

Event ordering must be deterministic.

The backend should define ordering using stable backend semantics such as:

- canonical occurrence time
- recorded time
- sequence cursor
- domain sequence
- replay cursor
- tie-breaker identity

The dashboard must not reorder ministry history using client-side guesses.

Replay must produce the same projections from the same canonical event stream.

If two events are close together, the backend must provide enough ordering information for deterministic timeline and projection rendering.

---

## Idempotency and Deduplication

Canonical events should support replay-safe idempotency.

The backend should define:

- event identity
- source identity
- idempotency keys
- duplicate handling
- correction semantics
- supersession rules

The system should avoid duplicate ministry meaning even when integrations, retries, imports, or operational workflows produce repeated input.

---

## Corrections and Supersession

Ministry history should remain trustworthy when information changes.

The event taxonomy should distinguish between:

- an original event,
- a correction,
- a superseded interpretation,
- an administrative adjustment,
- and a visibility change.

Corrections should not silently rewrite ministry story.

The backend should preserve enough history to explain what changed and why, subject to permissions and trust boundaries.

---

## Timeline Integration

The Unified Timeline should consume backend-provided event timeline contracts.

Timeline items should include canonical meaning such as:

- event type
- pastoral label
- category
- subject
- actor
- occurrence time
- visibility level
- summary text
- detail availability
- related workflow links
- sensitive context indicators

The frontend may render timeline items, but it must not reconstruct event meaning from raw backend payloads.

---

## Workflow Trigger Integration

Workflow orchestration should depend on canonical event meaning.

Examples:

- visitor.created may open a first-touch follow-up workflow
- followUp.completed may advance connection status
- prayer.requestReceived may create care/prayer attention
- care.needIdentified may trigger escalation review
- group.membershipStarted may update formation journey
- serving.interestCaptured may open volunteer onboarding

Workflow triggers must be backend-governed, replay-safe, and explainable.

The dashboard may show why a workflow exists, but it must not decide canonical triggers.

---

## Projection Integration

Canonical events may project into:

- visitor detail summaries
- unified timeline
- follow-up queues
- care queues
- prayer context
- formation journey state
- group participation summaries
- serving readiness summaries
- communication history
- operational insights
- audit records
- AI guidance context

Projection behavior must be deterministic.

The same event stream should produce the same backend projections regardless of dashboard session, browser state, or frontend lifecycle.

---

## AI Guidance Boundaries

Pastoral AI surfaces may explain event meaning only within backend-governed boundaries.

AI should receive canonical event context rather than raw, ambiguous, or permission-unsafe fragments.

AI must respect:

- permissions,
- visibility levels,
- sensitive context flags,
- correction history,
- event category meaning,
- and backend-provided summaries.

AI must not invent canonical event interpretation.

---

## Permissions and Trust Boundaries

Event visibility must respect canonical permission and trust rules.

Some events may be visible only as restricted context.

Examples:

- confidential care note added
- pastoral-only prayer context updated
- restricted identity correction completed
- sensitive escalation opened
- AI summary generated from protected context

The frontend must not expose hidden details through event labels, counts, ordering hints, summaries, or inferred state.

Restricted events should be represented calmly and pastorally when visible at all.

---

## Pastoral Language

Event language should remain ministry-centered.

Prefer:

- First visit recorded
- Follow-up assigned
- Care need identified
- Prayer request received
- Group connection started
- Serving interest captured
- Household relationship updated
- Restricted pastoral context updated

Avoid:

- Entity mutation emitted
- Queue item inserted
- Payload processed
- Event handler fired
- Projection invalidated
- Permission-scoped object changed

Technical precision belongs in backend contracts and audit logs.

Dashboard language should help people care for people.

---

## Empty and Restricted States

When event data is missing, restricted, or unavailable, the dashboard should communicate calmly.

Examples:

> No ministry events have been recorded yet.

> This ministry context is restricted.

> Timeline details are not available for your role.

Empty and restricted states should not imply failure, blame, or technical malfunction unless the backend explicitly reports an operational issue.

---

## Event Versioning

Canonical event types and payload contracts should be versionable.

Versioning should support:

- future taxonomy refinement,
- safe projection replay,
- compatibility with older events,
- stable public-ish backend contracts,
- and migration without frontend reinterpretation.

The frontend should consume the versioned backend contract, not internal historical assumptions.

---

## Operational Analytics

Operational insights should depend on canonical events rather than frontend-derived activity counts.

Examples:

- follow-up responsiveness
- care attention volume
- prayer request trends
- attendance movement
- formation progression
- communication touchpoints
- serving interest flow
- group connection health

Insights should be explainable from canonical event streams and deterministic projections.

---

## Auditability

The taxonomy should support audit history for:

- sensitive event access
- event creation
- event correction
- event supersession
- workflow trigger decisions
- projection changes
- AI-assisted summaries
- permission-sensitive visibility
- administrative adjustments

Auditability protects ministry trust.

---

## Guardrails

Canonical Event Taxonomy Architecture must remain:

- backend-governed
- replay-safe
- deterministic
- explainable
- pastorally readable
- permission-aware
- thin-client friendly
- AI-safe
- projection-safe
- lifecycle-aware
- cross-domain consistent

The frontend must never become the canonical event interpreter.

---

## Non-Goals

This architecture does not define:

- dashboard screen layouts,
- React component structure,
- frontend state machines,
- database implementation details,
- final enum lists,
- integration-specific payloads,
- or migration scripts.

Those should follow after backend semantics and contracts are stable.

---

## Experience Standard

Canonical Event Taxonomy Architecture should help the ministry operating system tell the truth about what happened with clarity, consistency, and care.

It should allow ministry teams to see one person, one story, and one journey without needing to interpret technical activity themselves.

The system should turn ministry events into trustworthy operational meaning while preserving pastoral language, deterministic backend behavior, and confidentiality-aware governance.