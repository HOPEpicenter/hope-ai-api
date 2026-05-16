# HOPE Dashboard Canonical Contracts

## Purpose

This document defines the canonical backend contracts that the HOPE Dashboard must consume.

The dashboard is a thin pastoral/operator surface. It must not duplicate backend orchestration logic, infer lifecycle state heuristically, or create alternate meanings for visitor, followup, formation, or timeline state.

The backend is the source of truth.

## Architectural Principles

1. Backend owns truth, orchestration, projection, reconciliation, and integrity.
2. Dashboard renders backend truth and provides operator actions.
3. All person-centered data is anchored to `visitorId`.
4. Dashboard surfaces must not derive canonical status from names, emails, IDs, labels, or display text.
5. Cross-surface semantics must remain consistent across:
   - dashboard followups
   - visitor directory
   - visitor detail
   - formation profiles
   - integration timeline
   - OPS tools
6. Any diagnostic/test/system row exclusion must come from backend metadata, not frontend heuristics.
7. Integrity failures should be surfaced through explicit metadata, not hidden frontend assumptions.

## Canonical Backend Truth Surfaces

### GET /api/dashboard/followups

Purpose:

Returns the canonical dashboard followup queue for operator care work.

Source of truth:

- Formation profile projection
- Shared followup projection semantics
- Visitor identity existence validation

The dashboard should use this endpoint for the Today / Followups queue.

Response responsibilities:

- Return only displayable followup queue rows.
- Exclude rows that do not resolve to a canonical visitor record.
- Include projection integrity metadata.
- Include followup lifecycle state from backend projection.
- Include attention state from backend projection.
- Include projection metadata including source system and diagnostic classification.

Frontend must not:

- Recompute followup lifecycle state.
- Infer diagnostic/test records from name, email, visitorId, or assignee.
- Decide whether a row is orphaned.
- Treat display text as canonical identity.

Canonical followup item fields:

- `visitorId`
- `name`
- `email`
- `assignedTo`
- `assignedToName`
- `followupState`
- `attentionState`
- `projectionMetadata`
- `lastFollowupAssignedAt`
- `lastFollowupContactedAt`

Canonical followup states:

- `Assigned`
- `Contacted`
- `Resolved`
- `Unassigned`

Canonical attention states:

- `Action needed`
- `Contact made`
- `Resolved`
- `Unassigned`

Integrity metadata:

```json
{
  "projectionIntegrity": {
    "orphanFollowupsExcluded": 0
  }
}
```

### GET /api/formation/profiles

Purpose:

Returns canonical formation profile read models.

Source of truth:

- Formation event replay
- Formation profile projection
- Visitor identity existence validation for list results

The dashboard should use this endpoint for formation profile views and formation-focused summaries.

Response responsibilities:

- Return formation profile projection rows.
- Exclude orphan profile rows from list responses.
- Preserve direct visitorId lookup semantics.
- Include projection integrity metadata.
- Preserve replay/reconciliation semantics.

Frontend must not:

- Generate synthetic formation profiles.
- Infer visitor existence.
- Infer diagnostic/test status from names, emails, or IDs.
- Mutate formation state.

Canonical profile fields include:

- `visitorId`
- `stage`
- `stageReason`
- `stageUpdatedAt`
- `stageUpdatedBy`
- `assignedTo`
- `lastEventId`
- `lastEventType`
- `lastEventAt`
- `lastFollowupAssignedAt`
- `lastFollowupContactedAt`
- `lastFollowupOutcome`
- `lastFollowupOutcomeAt`
- `lastFollowupOutcomeNotes`
- `lastNextStepAt`
- `updatedAt`

Integrity metadata:

```json
{
  "projectionIntegrity": {
    "orphanProfilesExcluded": 0
  }
}
```

### GET /api/visitors/:visitorId

Purpose:

Returns canonical visitor identity and summary-backed visitor detail information.

Source of truth:

- Visitor record
- Visitor summary
- Engagement summary
- Formation profile
- Integration timeline preview

The dashboard should use visitor summary/detail surfaces for visitor detail pages rather than recomputing a visitor narrative from disconnected endpoints.

Frontend must not:

- Treat missing profile data as proof of visitor state.
- Invent pastoral state from partial data.
- Combine unrelated surfaces without backend-provided semantics.

### GET /api/integration/timeline

Purpose:

Returns canonical visitor-scoped integrated activity timeline.

Source of truth:

- Engagement events
- Formation events
- Integration aggregation layer
- Shared timeline ordering and cursor rules

Dashboard usage:

- Visitor detail timeline
- integrated activity history
- pastoral context
- formation/engagement narrative

Frontend must not:

- Reorder timeline items.
- Deduplicate timeline items heuristically.
- Merge streams independently.
- Infer lifecycle state from timeline alone when a projection endpoint exists.


### GET /api/integration/timeline/global

Purpose:

Returns canonical global unified timeline for cross-visitor operational visibility.

Dashboard usage:

- global Timeline page
- recent activity overview
- operational activity feed

Frontend must not:

- Use global timeline as a substitute for visitor detail state.
- Infer followup queue state from global timeline.

## Projection Integrity Semantics

Projection integrity metadata reports backend-side consistency checks.

Current known metadata:

- `orphanProfilesExcluded`
- `orphanFollowupsExcluded`

Meaning:

- `orphanProfilesExcluded`: profile rows excluded because they do not resolve to a canonical visitor record.
- `orphanFollowupsExcluded`: followup queue rows excluded because they do not resolve to a canonical visitor record.

Frontend may display these counts for diagnostics, but must not independently compute them as canonical truth.

## Forbidden Frontend Inference Rules

Dashboard frontend must not:

- Filter diagnostic/test rows by:
  - name
  - email
  - visitorId
  - assignee
  - string prefixes
- Generate synthetic visitor records.
- Generate synthetic formation profiles.
- Recompute followup lifecycle states.
- Recompute formation stages.
- Reorder canonical timeline results.
- Merge timeline streams independently.
- Treat display labels as canonical identifiers.
- Hide integrity problems without backend metadata.
- Add dashboard-only lifecycle semantics.

## Cross-Surface Consistency Rules

The following concepts must mean the same thing everywhere:

- visitor identity
- followup state
- attention state
- formation stage
- last activity
- assignment owner
- timeline event type
- diagnostic/source metadata
- projection integrity

Surfaces that must remain aligned:

- dashboard followups
- visitor directory
- visitor detail
- formation profiles
- integration timeline
- OPS audit tools
## Canonical Followup Lifecycle

Followup state is projected by the backend shared followup projection layer.

Rules:

- No assignee means Unassigned.
- Assigned with no outcome means open.
- Assigned with contact and no outcome means Contacted.
- Outcome recorded means Resolved.

Display language should be pastoral and care-centered, but must not change canonical state meanings.

Preferred pastoral microcopy:

Action needed -> needs care
Contact made -> contact made, outcome still needed
Resolved -> cared for / outcome recorded
Unassigned -> waiting assignment
## Canonical Formation Lifecycle

Formation state is projected from formation events.

Formation state must be changed only by backend event ingestion, replay, repair, or reconciliation flows.

Dashboard should display:

- current stage
- milestone history
- next step
- last event
- last event time
- stage reason
- pastoral guidance when available

Dashboard must not independently advance formation stages.

## Dashboard North Star

The dashboard is a pastoral cockpit.

It should help every operator:

- See who needs care.
- Understand their story.
- Understand why attention is needed.
- Take the next best pastoral action.
- Preserve continuity across ministry surfaces.

The dashboard should be warm, minimal, trustworthy, and action-oriented.

It should support pastors, followup teams, and operations without becoming a separate source of truth.

## Canonical Status Enumerations

Canonical statuses must remain stable across all backend and dashboard surfaces.

The frontend may change presentation language, color, grouping, or emphasis, but must not redefine canonical meanings.

### Canonical Followup States

| Canonical State | Meaning |
|---|---|
| `Unassigned` | No operator currently owns the followup. |
| `Assigned` | Followup is assigned and awaiting care action. |
| `Contacted` | Contact occurred but final outcome has not been recorded. |
| `Resolved` | Final outcome was recorded and followup is complete. |

### Canonical Attention States

| Canonical Attention State | Meaning |
|---|---|
| `Action needed` | Followup requires operator action. |
| `Contact made` | Contact occurred but closure/outcome is still pending. |
| `Resolved` | Care workflow completed. |
| `Unassigned` | Followup has not yet been routed to an owner. |

### Canonical Formation Stages

Current formation stages are backend-owned projection states.

Dashboard must display but not redefine them.

Examples include:
- Guest
- Connected
- Growing
- Serving
- Leading

Future stages must be added backend-first.

## Canonical Event Types

Timeline and projection systems must share canonical event semantics.

Dashboard may group or visually organize events, but must not reinterpret canonical event meaning.

### Engagement Event Types

Examples:
- `note.add`
- `status.transition`
- `contact.recorded`

### Formation Event Types

Examples:
- `FOLLOWUP_ASSIGNED`
- `FOLLOWUP_CONTACTED`
- `FOLLOWUP_UNASSIGNED`
- `FOLLOWUP_OUTCOME_RECORDED`
- `NEXT_STEP_SELECTED`
- `FORMATION_STAGE_UPDATED`

### Integration Event Types

Examples:
- integration aggregation updates
- ministry participation updates
- serving enrollment updates

### OPS/System Event Types

Examples:
- projection repair
- replay audit
- integrity reconciliation
- repair orchestration

OPS/system events should remain clearly distinguishable from pastoral/person-centered events.

## Canonical Assignment Semantics

Assignment ownership is backend-owned state.

Assignment semantics must remain consistent across:
- dashboard followups
- formation profiles
- OPS followup queues
- visitor detail surfaces

### Assignment Rules

1. An assigned followup has an explicit owner.
2. Assignment changes must be event-driven.
3. Assignment history belongs in timeline surfaces.
4. Dashboard must not infer assignment state from UI context.
5. Assignment visibility must remain consistent across all surfaces.

Canonical assignment fields include:
- `assignedTo`
- `assignedToName`
- `lastFollowupAssignedAt`

## Canonical Timeline Ordering Rules

Timeline ordering must remain deterministic across all timeline surfaces.

Ordering semantics are backend-owned.

Frontend must not independently reorder events.

### Ordering Rules

1. Primary ordering is event timestamp descending.
2. Tie-breaking must remain deterministic.
3. Cursor semantics are backend-owned.
4. Timeline replay must remain stable.
5. Integrated timelines must preserve canonical ordering rules.

### Timeline Integrity Goals

Timeline surfaces must:
- avoid drift
- avoid duplicate interpretation
- preserve causality
- preserve replay determinism

## Canonical Diagnostic Classification Rules

Diagnostic/system/test data classification is backend-owned.

Frontend must not independently classify rows as:
- test
- smoke
- diagnostic
- synthetic
- invalid

Classification should originate from:
- projection metadata
- source system metadata
- diagnostic flags
- orchestration metadata

Dashboard should consume backend classification metadata rather than deriving classification heuristically.

## Dashboard Consumption Rules

Dashboard is a consumer of canonical backend truth.

Dashboard may:
- render
- group
- format
- prioritize visibility
- improve usability
- improve readability
- improve pastoral usability

Dashboard must not:
- reinterpret lifecycle meaning
- redefine orchestration semantics
- invent projection state
- merge conflicting truths
- mutate canonical backend meaning
- create alternate lifecycle models

### Backend Ownership Boundaries

Backend owns:
- orchestration
- projections
- replay
- integrity
- reconciliation
- timeline ordering
- lifecycle semantics
- pastoral intelligence semantics

Frontend owns:
- presentation
- layout
- usability
- interaction flows
- accessibility
- pastoral UX refinement

## Future Intelligence Layer Contracts

The intelligence layer exists to assist ministry leaders, not replace them.

Future intelligence contracts may include:
- care prioritization
- engagement risk
- integration risk
- milestone readiness
- followup urgency
- pastoral context summarization
- human touch prompts
- pastoral reasoning summaries

### Intelligence Layer Rules

1. Intelligence outputs must remain explainable.
2. Intelligence outputs must remain reviewable.
3. Human operators remain authoritative.
4. Backend intelligence semantics are canonical.
5. Dashboard should present intelligence clearly without overstating certainty.

### Pastoral Intelligence Philosophy

The intelligence layer should:
- augment care
- preserve humanity
- improve continuity
- reduce operational blindness
- surface meaningful context

The intelligence layer must not:
- replace pastoral discernment
- automate ministry relationships
- become a black-box authority
- remove human accountability


## Dashboard Experience Philosophy

The dashboard should follow a 70/30 design philosophy:

- 70% Ministry Cockpit: warm, pastoral, relational, care-centered.
- 30% Data Control Center: precise, structured, operational, trustworthy.

The dashboard should feel like:

“A pastor’s heart with an engineer’s brain.”

Design should prioritize people before data, but never sacrifice operational accuracy.

## State Verified Semantics

Dashboard surfaces may display a `State Verified` indicator only when the backend confirms that the relevant projection, timeline, and identity data are synchronized.

Frontend must not independently decide that state is verified.

`State Verified` must be backend-owned metadata.

## Manual vs Autogenerated Task Semantics

Followup tasks should clearly distinguish between:

- autogenerated tasks
- manual tasks

This classification must come from backend task/projection metadata.

Frontend must not infer task origin from:
- labels
- names
- source text
- IDs

## Designer Alignment Notes

Designers should treat backend contracts as fixed semantic truth.

Design may change:
- layout
- hierarchy
- visual grouping
- color treatment
- microcopy
- interaction patterns

Design must not change:
- lifecycle meanings
- status definitions
- visitor identity rules
- followup state rules
- formation progression rules
- timeline ordering rules
- diagnostic classification rules




## Canonical Visitor Narrative Contract

The canonical visitor narrative is the backend-owned pastoral and operational representation of a single visitor.

Purpose:
- establish one trusted visitor story
- prevent cross-surface drift
- unify engagement, formation, followup, and integration semantics
- provide a stable foundation for dashboard and intelligence experiences

Primary surface:
- `GET /api/visitors/:id/summary`

The visitor narrative contract is the canonical source for:
- visitor identity context
- engagement summary
- engagement risk
- engagement timeline preview
- formation profile
- followup lifecycle state
- attention state
- milestone state
- integration summary
- derived journey state

Frontend must treat this surface as authoritative.

### Canonical Narrative Responsibilities

The backend narrative surface is responsible for:

- identity consistency
- pastoral lifecycle consistency
- timeline ordering consistency
- followup lifecycle consistency
- milestone derivation
- journey derivation
- projection integrity enforcement
- cross-stream semantic alignment

Frontend must not recompute these independently.

### Canonical Narrative Sections

The canonical visitor narrative may include:

- `visitor`
- `summary.engagement`
- `summary.integration`
- `summary.formation`
- `summary.journey`
- `summary.projectionIntegrity`
- `summary.stateVerification`

### Canonical Followup Semantics

Canonical followup lifecycle states are backend-owned.

Allowed canonical states:

- `none`
- `assigned`
- `contacted`
- `resolved`

Derived attention semantics are backend-owned.

Allowed canonical attention states:

- `needs_attention`
- `clear`

Frontend must not derive these independently from timestamps.

### Canonical Journey Semantics

Journey state is a derived backend narrative layer.

Frontend must not:
- infer journey progression
- infer milestones
- infer formation advancement
- infer pastoral readiness

Journey semantics must derive from canonical backend orchestration and replay logic.


### Canonical Narrative Expansion Rules

New visitor narrative fields should be added backend-first.

Frontend feature requirements must not introduce:
- dashboard-only visitor state
- duplicate lifecycle semantics
- alternate pastoral classifications
- frontend-owned orchestration

All narrative expansion should preserve:
- replay determinism
- projection consistency
- cross-surface semantic alignment

### Timeline Preview Semantics

`summary.engagement.timelinePreview` is a backend-curated narrative preview.

Frontend must not:
- reorder items
- deduplicate items heuristically
- merge additional streams into preview
- reinterpret timeline ordering semantics

### Projection Integrity Semantics

Narrative surfaces may expose projection integrity metadata.

Integrity metadata is backend-owned.

Frontend may display integrity indicators but must not invent integrity conclusions.

### State Verification Semantics

Narrative surfaces may expose synchronization verification metadata.

`State Verified` indicators must be backend-owned.

Frontend must not independently decide synchronization correctness.

### Narrative Contract Goal

The canonical visitor narrative should eventually become the foundation for:

- visitor detail
- pastoral cockpit
- followup intelligence
- care continuity
- shepherding workflows
- future pastoral intelligence systems





