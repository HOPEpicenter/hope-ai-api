# HOPE Ministry OS — Ministry State Matrix

Date: 2026-07-14

Status: Pilot Readiness Architecture Baseline

## Purpose

This document defines the canonical ownership and presentation rules for ministry state across HOPE Ministry OS.

The dashboard must not invent, reinterpret, or independently mutate ministry state.

Commands create canonical events.

Events build projections.

Projections drive pastor-facing experiences.

Every workspace must present the same ministry truth while emphasizing the part of that truth relevant to its pastoral purpose.

## Architectural Rule

A ministry concept must have one canonical backend owner.

Dashboard workspaces may select, summarize, translate, or arrange verified backend data, but they must not independently derive conflicting business meaning.

## Cross-Surface Ministry State Matrix

| Ministry Concept | Canonical Source | Today | Person 360 | Journey | Care | Insights | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Person identity | Visitor projection | Summary | Primary | Context | Context | Context | Administrative context |
| Contact information | Visitor projection | Context when needed | Primary | Limited | Limited | Limited | Administrative context |
| Care owner | Formation projection derived from canonical ownership events | Display and action context | Display and action | Display | Primary display and action | Filter and worklist context | Staff eligibility management |
| Ownership history | Canonical formation event stream | Recent context | Timeline | Story context | Assignment context | Not primary | Audit context |
| Formation stage | Formation profile projection | Summary | Current ministry state | Primary | Context | Segmentation | Readiness context |
| Selected next step | Formation profile projection derived from formation events | Recommended ministry action | Current ministry state | Primary | Context | Opportunity context | Not primary |
| Completed next step | Formation event stream and profile projection | Updated ministry state | Timeline and current state | Primary | Context | Opportunity resolution | Not primary |
| Needs attention | Verified backend care or opportunity projection | Primary work signal | Explanation | Context | Queue signal | Worklist signal | Readiness summary only |
| Care classification | Care candidate projection | Priority context | Explanation | Context | Primary | Worklist context | Not primary |
| Care outcome | Canonical formation event and derived projections | Updated work state | Timeline and current state | Story context | Primary action and result | Opportunity resolution | Audit context |
| Last meaningful contact | Verified backend engagement or care projection | Aging and priority context | Ministry history | Story context | Care context | Risk or opportunity context | Not primary |
| Pastoral notes | Canonical pastoral notes projection derived from engagement events | Preview only when relevant | Primary note workspace | Story context when relevant | Context when relevant | Not primary | Audit and contract readiness |
| Note correction history | Immutable engagement event history | Not primary | Edited indicator and history | Timeline context | Not primary | Not primary | Audit context |
| Ministry timeline | Canonical integration timeline | Recent preview | Full story | Interpreted journey story | Recent care activity | Contextual evidence | Audit/readiness context |
| Staff identity | Canonical projected Staff directory | Human-readable owner | Human-readable owner | Human-readable owner | Assignment source | Human-readable filters | Primary administration |
| Assignment eligibility | Active canonical Staff identities | Action options | Action options | Not primary | Primary action constraint | Filter constraint | Primary administration |
| Recommended action | Backend-authored care, task-preview, or opportunity contract | Primary | Explanation and action | Journey action | Care action | Primary worklist action | Not primary |
| Test-record visibility | Shared dashboard presentation policy over verified records | Hidden by default | Hidden by default | Hidden by default | Hidden by default | Hidden by default | Administrative visibility |
| System readiness | Verified health and contract registry | Warning only when ministry truth is incomplete | Warning only when data is incomplete | Warning only when data is incomplete | Warning only when data is incomplete | Warning only when data is incomplete | Primary |

## Canonical Concept Definitions

### Person Identity

Person identity comes from the visitor projection.

Names, email addresses, phone numbers, addresses, birthdays, and stable person identifiers must not be reconstructed from unrelated timeline events when canonical visitor identity is available.

### Care Owner

The current care owner comes from the formation projection derived from canonical `FOLLOWUP_ASSIGNED` and `FOLLOWUP_UNASSIGNED` events.

The dashboard must never treat a locally selected staff value as current ownership until the backend command succeeds and refreshed projections confirm the new state.

### Ownership History

Historical assignments remain part of the immutable event stream.

Unassignment clears current ownership but does not erase who previously carried responsibility.

### Formation Stage

Formation stage comes from the canonical formation profile projection.

Pastor-facing pages may translate stage codes into ministry language, but they must not calculate a different stage locally.

### Next Step

Next-step selection and completion are formation events.

Journey is the primary workspace for interpreting next-step movement, while other pages may show verified summaries or actions.

### Needs Attention

Needs-attention state must be supplied by a verified backend projection or contract.

Pages must not create page-specific definitions of who needs attention.

### Meaningful Contact

Meaningful contact should reflect the canonical engagement or care lifecycle contract.

A page may display elapsed time or pastoral wording, but the underlying timestamp and lifecycle meaning must remain backend-authoritative.

### Pastoral Notes

The visible note is the current projected version.

Corrections create immutable audit events rather than destructively replacing history.

The pastor-facing experience must show the corrected note while preserving edited metadata and accessible history.

### Recommended Action

Recommended actions must be authored by verified backend care, task-preview, or opportunity contracts.

The dashboard may translate the action into clearer pastoral language but must not invent a competing recommendation.

## Cross-Page Consistency Invariants

The following statements must always be true:

1. The same person has the same current owner on Today, Person 360, Journey, Care, and Insights.
2. An ownership command is not considered complete until refreshed backend projections agree.
3. An unassigned person who still needs care remains visible in an appropriate ministry worklist.
4. Inactive staff cannot receive new assignments.
5. Historical assignments continue to resolve to human-readable staff identity where possible.
6. Formation stage and next-step state agree across Person 360 and Journey.
7. Completed care outcomes update all worklists that depend on the open-care lifecycle.
8. Corrected notes show the same current text and edited state wherever notes are presented.
9. Timeline chronology remains deterministic across repeated reads and replay.
10. Backend failure is shown as incomplete ministry information, never as an all-clear state.
11. Engineering and test records remain hidden from ministry workflows by default.
12. No pastor-facing page displays raw backend event codes or technical staff IDs when a display abstraction exists.

## Change Governance

Any change that introduces a new ministry concept must identify:

- the canonical backend owner;
- the command or event that changes it;
- the projection that exposes current state;
- the workspaces that consume it;
- the regression or walkthrough that proves cross-page consistency.

A new dashboard-only business-state derivation is not permitted without an explicit architecture decision.
