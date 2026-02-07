# Public API Contract

## Visitors

### POST /api/visitors
Creates a visitor.

**Idempotency**
- If the same email is submitted again, the API returns the existing visitorId.

**Request JSON**
~~~json
{ "name": "string", "email": "string" }
~~~

**Validation**
- name required
- email required, basic format validation

**Response**
- 201 Created (new visitor)
- 200 OK (existing email; idempotent)
~~~json
{ "ok": true, "visitorId": "uuid" }
~~~

**Errors**
- 400: { "ok": false, "error": "name is required" | "email is required" | "email is invalid" }
- 500: { "ok": false, "error": "CREATE_VISITOR_FAILED" }

### GET /api/visitors/:id
Fetch a visitor by id.

