# Integration Timeline Ordering Contract v1

Scope: GET /api/integration/timeline (v1)

## Ordering (newest-first)
- Primary: occurredAt (descending)
- Tie-break: deterministic, stable across pages (must not reorder between requests)

## Cursor semantics
- nextCursor represents the *last item* returned (the boundary)
- Paging returns items strictly older than (or strictly after) the boundary key to prevent overlap

## Streams
- Aggregates engagement + formation into a single ordered feed
- Must preserve stable ordering guarantees even when events share the same occurredAt

## Non-goals (v1)
- Ownership/follow-up assignment
- Group/program membership
