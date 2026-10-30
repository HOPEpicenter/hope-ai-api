# Visitor Provenance Contract v1

**Status:** Foundation only; no synthetic designation capability
**Scope:** Canonical visitor persistence; no queue eligibility change

## Contract

Newly created canonical visitor records receive optional `provenanceJson`
containing a V1 provenance value:

- `classification`: `operational` or reserved `synthetic`;
- `designatedAt`: canonical UTC ISO timestamp;
- `source`: `canonical_visitor_create` or `canonical_visitor_upsert_create`;
- `actor`: `{ "type": "system", "id": "hope-ai-api" }`;
- `reason`: `new_visitor_record` or `visitor_created_via_upsert`, paired with
  its corresponding source.

The only classification assigned by this foundation is `operational`. Direct
visitor creation uses `canonical_visitor_create` /
`new_visitor_record`; creation through the secondary repository's upsert path
uses `canonical_visitor_upsert_create` / `visitor_created_via_upsert`. The
`synthetic` value is reserved for a separately approved, trusted provisioning
mechanism. This contract does not create that mechanism, an endpoint, a fixture
identity, or a way for clients to select it.

The provenance is serialized as JSON because Azure Table properties do not
store nested objects as native entity properties. It is not accepted from
ordinary visitor create or update input. Existing visitor IDs, identity
indexes, and event history are unchanged.

## Read and update behavior

Valid operational provenance is exposed through an optional `provenance`
response property. This version rejects synthetic values because no approved
source, actor, or reason exists for assigning them. Missing, synthetic-shaped,
or malformed values are not rewritten and the optional property remains
absent for backwards compatibility. Callers that need an effective
classification must use `resolveVisitorEffectiveClassification` on the stored
serialized provenance: it returns `historical_unclassified` for absent,
malformed, or unsupported values. Such records remain operationally visible.
Unknown, malformed, or absent provenance must never be treated as synthetic.

Updates preserve provenance from the stored entity. They cannot change it.
There is no reclassification operation in V1. A later correction or synthetic
fixture workflow requires a separately reviewed authorization, audit, and
concurrency design.

## Security limits

This provenance records a server-side creation classification, not proof of a
person's identity, consent, or ministry status. The system actor identifies
the application process, not a human administrator. This foundation does not
authorize synthetic fixtures and does not change Six-Week queues, Morning
Briefing aggregates, dashboard filtering, or any production feature setting.

Visitor Table updates currently use read-then-replace or merge operations
without ETag conditions. This contract prevents ordinary update inputs from
changing provenance, but it does not solve general concurrent profile-update
lost-write races.
