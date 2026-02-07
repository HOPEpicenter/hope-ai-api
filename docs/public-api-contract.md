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

