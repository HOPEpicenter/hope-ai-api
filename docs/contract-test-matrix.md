# Contract test matrix (lightweight)

This is a lightweight, script-backed contract matrix for the public-ish surface (/api).

## Engagement ingestion (event envelope v1)
Endpoint: POST /api/engagements/events

✅ Accepts (strict):
- v=1
- eventId = evt-<32 hex>
- visitorId = UUID
- occurredAt = ISO-8601 with timezone (Z or offset)
- source.system present
- data validated for known v1 types:
  - status.transition: data.from, data.to
  - note.add: data.text (1..2000), optional visibility team/private
  - tag.add/remove: data.tag (slug-ish)

❌ Rejects:
- missing source.system
- invalid eventId format
- invalid occurredAt format
- known types missing required data fields

## Engagement reads
- GET /api/engagements/timeline?visitorId=...&limit=...
  - ok=true, v=1, items[], item.type non-empty, item.occurredAt present
- GET /api/engagements/status?visitorId=...
  - ok=true, visitorId matches; v optional
- GET /api/engagements/score?visitorId=...&windowDays=...
  - ok=true, visitorId matches, needsFollowup boolean, scoreReasons[] stable strings

## Formation reads
- GET /api/visitors/{id}/formation/events?limit=...
  - ok=true, items[] present for seeded/created visitor

## Script mapping
- scripts/smoke-visitor-engagements-e2e.ps1
  - ingestion envelope + timeline + status + score (happy path + some 400s)
- scripts/regression.ps1
  - engagement timeline + formation events list sanity
- scripts/smoke.ps1
  - legacy quick sanity (stops early)