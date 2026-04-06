# Public API Contract

This document tracks the public-ish `/api/*` surface for HOPE AI API.

---

## Visitors

### POST /api/visitors

Creates (or reuses) a visitor by email.

**Idempotency**
- The API is idempotent by normalized email (`trim + lowercase`)
- Same email always returns same `visitorId`

**Request JSON**
~~~json
{ "name": "string", "email": "string" }
~~~

**Response (201 Created)**
~~~json
{ "ok": true, "visitorId": "uuid" }
~~~

**Response (200 OK)**
~~~json
{ "ok": true, "visitorId": "uuid" }
~~~

---

### GET /api/visitors/:id

Fetch a visitor by id.

**Response**
```json
{
  "ok": true,
  "visitor": {
    "visitorId": "uuid",
    "name": "string",
    "email": "string | null",
    "createdAt": "ISO-8601 string",
    "updatedAt": "ISO-8601 string"
  }
}
```

---

### GET /api/visitors/:id/summary

Returns summary-backed visitor detail.

**Response**
```json
{
  "ok": true,
  "v": 1,
  "visitor": {},
  "engagement": {
    "summary": {},
    "timelinePreview": []
  },
  "integration": {},
  "formation": {
    "profile": {},
    "milestones": {}
  }
}
```

**Notes**
- Primary dashboard truth surface
- Journey not yet included

---

## Formation

### GET /api/visitors/:id/formation/events

Returns formation events.

### GET /api/visitors/:id/formation/profile

Returns derived formation profile snapshot.

### POST /api/formation/events

Protected endpoint (`x-api-key` required)

Supported event types:
- SALVATION_RECORDED
- BAPTISM_RECORDED
- MEMBERSHIP_RECORDED

---

## Engagement

### POST /api/engagements/events

Append engagement event.

### GET /api/engagements/timeline

Global engagement timeline.

### GET /api/engagements/:visitorId/timeline

Visitor engagement timeline.

### GET /api/engagements/status

Derived engagement status.

### GET /api/engagements/score

Derived engagement score.

---

## Integration

### GET /api/integration/timeline

Protected

### GET /api/integration/timeline/global

Protected

### GET /api/integration/summary

Protected

---

## Journey (NEW - 2026-04-06)

### GET /api/visitors/:id/journey

```http
GET /api/visitors/:id/journey
```

Returns a derived journey read model.

**Response**
```json
{
  "ok": true,
  "visitorId": "string",
  "journey": {
    "currentStep": "NEW | ENGAGED | FORMING | COMMITTED",
    "updatedAt": "ISO-8601 string or null",
    "sources": ["engagement", "formation"],
    "evidence": [
      {
        "source": "engagement | formation",
        "eventType": "string",
        "at": "ISO-8601 string",
        "summary": "string (optional)"
      }
    ]
  }
}
```

**Notes**
- Read-only derived surface
- No storage
- Fully auditable

---

## Current documented summary additions

Formation milestone flags:
- salvation
- baptism
- membership

Visitor summary includes:
- engagement summary
- engagement timeline preview
- integration summary
- formation profile
- formation milestone flags
