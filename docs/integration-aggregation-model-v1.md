# Integration Aggregation Model v1

Scope: GET /api/integration/timeline (v1)

This document defines how the integration timeline aggregates Engagement + Formation into one ordered feed.
For ordering + cursor boundary details, see: docs/integration-ordering-contract-v1.md

## Inputs
- Engagement events stream (per visitor)
- Formation events stream (per visitor)

## Output
A unified, newest-first timeline of items for a visitor.
Each item MUST include at least:
- visitorId
- stream: engagement | formation
- occurredAt (ISO-8601)
- eventId (stable identifier within its stream)

## Merge rules (v1)
- Combine both streams, then sort newest-first using the ordering contract.
- Tie-break MUST be deterministic and stable across pages.
- Cursor boundary MUST prevent overlap/duplication between pages.

## Cursor invariants (v1)
- nextCursor represents the last item returned (the page boundary).
- Page N+1 returns items strictly older than the boundary key (no overlap).
- No skipping: if no new events are inserted, walking pages should eventually enumerate the full set.

## Non-goals (v1)
- Ownership / follow-up assignment
- Group / program membership
- Any “smart” derived insights beyond the merge itself

