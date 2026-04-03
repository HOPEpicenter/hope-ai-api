# Public API Contract

## Visitors

### POST /api/visitors
Creates (or reuses) a visitor by email.

**Idempotency**
- The API is **idempotent by normalized email** (trim + lowercase).
- If the email has been seen before, the API returns the **same** `visitorId` for that email.

**Request JSON**
~~~json
{ "name": "string", "email": "string" }
~~~

**Validation**
- `name` required
- `email` required, basic format validation

**Response (201 Created)**
Returned when a **new** visitor was created.
~~~json
{ "ok": true, "visitorId": "uuid" }
~~~

**Response (200 OK)**
Returned when the email already exists (idempotent repeat).
~~~json
{ "ok": true, "visitorId": "uuid" }
~~~

**Errors**
- 400: `{ "ok": false, "error": "name is required" | "email is required" | "email is invalid" }`
- 500: `{ "ok": false, "error": "CREATE_VISITOR_FAILED" }`

### GET /api/visitors/:id
Fetch a visitor by id.

## GET /api/integration/timeline/global

**Auth**
- Requires x-api-key header


### Query
- `limit` (optional)
- `cursor` (optional)

### Response
```json
{
  "ok": true,
  "items": [],
  "nextCursor": null
}
```

### Notes
- Phase 1 global unified timeline is formation-backed.
- Visitor-scoped integrated timeline remains available separately.
- Future phases will:
  - include engagement events in the global feed
  - introduce a production-grade stable cursor



## 2026-04-02 Addendum - GET /api/visitors/:id/summary

### Route
GET /api/visitors/:id/summary

### Auth
Requires x-api-key.

### Response shape
```json
{
  "ok": true,
  "v": 1,
  "visitorId": "string",
  "summary": {
    "engagement": {
      "summary": {},
      "timelinePreview": []
    },
    "integration": {},
    "formation": {
      "profile": {},
      "milestones": {
        "hasSalvation": false,
        "hasBaptism": false,
        "hasMembership": false
      }
    }
  }
```
Current dashboard usage

The dashboard visitor detail page consumes this route as the primary summary-backed source for:

engagement summary
engagement timeline preview
integration summary
formation profile
formation milestone flags



