\# Ops Dashboard Contract (v1)



This document defines the stable contract between the HOPE AI backend and the Ops Dashboard for Formation Profiles.



\## Canonical storage keys (MUST)

FormationProfile snapshot is stored at canonical Azure Table keys:



\- PartitionKey: `"VISITOR"`

\- RowKey: `visitorId`



These keys are enforced by the domain recorder.



\## Snapshot semantics

\- Formation Events are \*\*append-only\*\* (immutable) in `devFormationEvents` (Azurite) / prod formation events table.

\- Formation Profile is a \*\*snapshot\*\* in `devFormationProfiles` (Azurite) / prod formation profiles table.

\- Posting an event MUST upsert the FormationProfile snapshot.



\## Endpoints



\### Health

\- `GET /health` → `{ ok: true }`



\### Record formation event

\- `POST /api/formation/events`



Writes:

1\) append-only FormationEvent entity

2\) upserts FormationProfile snapshot



Request (minimum required shape):

```json

{

&nbsp; "visitorId": "string",

&nbsp; "type": "string",

&nbsp; "occurredAt": "ISO-8601 timestamp (optional)",

&nbsp; "summary": "string (optional)",

&nbsp; "metadata": { "any": "json" }

}



