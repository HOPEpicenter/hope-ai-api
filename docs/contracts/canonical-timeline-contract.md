# Canonical Timeline Contract

## Purpose

Defines the authoritative HOPE timeline semantics for:
- visitor narrative surfaces
- dashboard activity feeds
- integration aggregation
- ops inspection surfaces
- timeline previews
- cursor paging
- ordering guarantees

---

# Canonical Timeline Principles

## Backend Owns Narrative Semantics

Frontend/UI layers must not:
- reorder events
- infer semantic meaning
- merge independent streams
- reinterpret activity priority
- synthesize engagement state
- derive hidden workflow meaning

Timeline semantics are backend-owned.

---

# Timeline Sources

## Engagement Stream

Source:
- engagement events

Examples:
- note.add
- status.transition

## Formation Stream

Source:
- formation events

Examples:
- FOLLOWUP_ASSIGNED
- FOLLOWUP_CONTACTED
- FOLLOWUP_OUTCOME_RECORDED
- NEXT_STEP_SELECTED
- NEXT_STEP_COMPLETED

---

# Canonical Event Shape

## Shared Event Envelope

Required fields:
- eventId
- visitorId
- occurredAt
- type
- stream

Optional:
- summary
- activityType
- activityCategory
- data

---

# Canonical Ordering Semantics

## Primary Ordering

Newest-first by:
- occurredAt DESC

## Tie-Break Ordering

When occurredAt values are equal:
- stable deterministic ordering is required
- cursor boundaries must remain stable
- pagination must not skip or duplicate events

## Ordering Guarantees

The system guarantees:
- deterministic paging
- no overlap across pages
- no hidden reordering
- stable cursor progression
- stable replay behavior

---

# Cursor Semantics

## Cursor Meaning

Cursor represents:
- exclusive upper boundary
- fetch older-than cursor

## Cursor Guarantees

Cursor paging must:
- never overlap prior page
- never skip valid events
- remain URL-safe
- round-trip through URL encoding
- preserve stable ordering guarantees

---

# Cross-Stream Aggregation Rules

## Unified Timeline

Integration timeline merges:
- engagement stream
- formation stream

## Merge Semantics

Cross-stream aggregation must:
- preserve canonical ordering
- preserve deterministic paging
- preserve tie-boundary correctness
- preserve replay safety

---

# Grouping Semantics

Grouping is presentation-safe only.

Grouping must:
- never change ordering
- never affect cursor boundaries
- never synthesize narrative meaning
- never merge semantically distinct activities

---

# Dedupe Semantics

Deduplication exists only to prevent semantic duplicates.

Deduplication must not:
- remove meaningful workflow history
- collapse status transitions
- collapse next-step progression
- hide replay artifacts needed for auditing

---

# Global Timeline Semantics

## Purpose

Global timeline provides:
- cross-visitor operational inspection
- system-wide activity monitoring
- operational audit visibility

## Restrictions

Global timeline must not:
- reinterpret visitor narratives
- replace visitor-scoped timeline semantics
- introduce alternate ordering behavior

---

# Preview Surface Semantics

Preview surfaces include:
- dashboard cards
- visitor summaries
- journey previews
- activity previews

Preview surfaces:
- derive from canonical timeline semantics
- must not redefine ordering
- must not reinterpret meaning

---

# Shadow Read Semantics

Shadow reads are validation-only.

Shadow reads:
- must never change canonical semantics
- must preserve output compatibility
- must preserve cursor behavior
- must preserve ordering guarantees

---

# Regression Requirements

Critical regressions include:
- cross-stream cursor boundary
- occurredAt tie handling
- no overlap paging
- deterministic ordering
- stable cursor progression
- replay consistency
- URL-safe cursor behavior

---

# Future Governance

Future additions must be:
- additive
- backward compatible
- semantically stable

Future work must not:
- break cursor semantics
- redefine ordering rules
- move semantic ownership into frontend layers