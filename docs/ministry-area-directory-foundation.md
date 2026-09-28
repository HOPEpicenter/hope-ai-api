# Ministry Area directory foundation

The backend owns a Ministry Area's stable, opaque `ministryAreaId`. Its editable
`displayName` is ministry language (for example, Youth Ministry), not an ID or
an authorization role. No generic areas are seeded. An administrator creates
real areas as needed. Renaming or deactivating one retains its ID and history.

## Admin contract

All four routes require the existing admin API key and an active, configured
canonical Staff administrator through `x-hope-admin-actor-id`.

| Method | Route | Body or result |
| --- | --- | --- |
| `POST` | `/api/ministry-areas` | `{ "commandId": "UUID", "displayName": "Youth Ministry" }` |
| `PATCH` | `/api/ministry-areas/{ministryAreaId}` | `{ "commandId": "UUID", "displayName"?: string, "status"?: "active" \| "inactive", "reason"?: string }` |
| `GET` | `/api/ministry-areas` | `{ ok, requestId, count, items }`, including inactive areas |
| `GET` | `/api/ministry-areas/{ministryAreaId}/audit` | The ordered append-only events, including actor, timestamp, and reason |

Each write returns `202` with `eventId`, `ministryAreaId`, and event `type`.
Callers generate a fresh UUID `commandId` per intended write and **reuse that
same ID** when retrying after a timeout. A matching retry returns the original
accepted result without appending another event; reuse for a different command
returns `409`. Validation returns `400`, missing area `404`, and a duplicate
normalized display name `409`. Names are unique even when inactive; rename an
existing area or reactivate it instead of silently reusing its identity.

Events use Azure Table `MinistryAreaEvents`, in a single directory partition.
Each write is atomic with an ETag-checked revision of the directory head, so
two concurrent commands cannot independently accept the same display name.
Projection replays sequence-ordered events and does not delete inactive areas.
The request ID is for diagnostics; it is separate from the retry `commandId`.

The directory foundation does **not** change roles, authorization decisions,
dashboard controls, or create real ministry records. Staff linkage and
active-area validation are documented in `ministry-area-staff-linkage.md`.
