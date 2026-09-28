# Ministry Area Staff roster

`GET /api/ministry-areas/{ministryAreaId}/staff` provides an
administrator-only, read-only roster derived from the canonical Staff
projection.

The roster does not introduce a new Staff or Ministry Area source of truth.
It joins the canonical Ministry Area directory to the canonical Staff directory
through the persisted `ministryAreaId`.

## Response

A successful response has this shape:

```json
{
  "ok": true,
  "requestId": "request-id",
  "ministryAreaId": "ministry-area-opaque-id",
  "ministryArea": {
    "ministryAreaId": "ministry-area-opaque-id",
    "displayName": "Care Ministry",
    "status": "active",
    "createdAt": "ISO timestamp",
    "updatedAt": "ISO timestamp",
    "lastEventId": "event-id"
  },
  "count": 1,
  "items": [
    {
      "staffId": "staff-opaque-id",
      "displayName": "Staff Name",
      "roleLabel": "Care Team",
      "status": "active",
      "ministryAreaId": "ministry-area-opaque-id"
    }
  ]
}
```

The Staff roster intentionally excludes contact details and Entra identifiers.

Inactive Staff remain visible when their canonical Staff record is linked to the
area. An inactive Ministry Area remains readable and retains its historical
Staff references.

A missing Ministry Area returns `404`. The endpoint requires the existing
administrator API key plus an active configured canonical administrator.

## Boundary

Ministry Area membership remains descriptive organizational metadata. This
read model does not grant permissions, change authorization, change Staff
status, alter assignment availability, or mutate either event stream.
