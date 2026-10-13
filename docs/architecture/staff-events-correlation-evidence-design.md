# StaffEvents Correlation Evidence Design

Status: versioned synthetic contract and proposed future persistence only.
No StaffEvents writer, storage schema, production dependency injection, or
OAuth behavior is changed by this design.

## Current evidence and limitations

`StaffEventsRepository` stores one entity per event in the `StaffEvents`
table. Its partition key is `staffId`; its row key is
`occurredAt + "__" + eventId`. The persisted fields are `partitionKey`,
`rowKey`, `eventId`, `staffId`, `type`, `occurredAt`, `actorId`, and
`dataJson`. The event payload currently contains profile/status/contact,
ministry-area, and optional Entra tenant/object IDs. It has no operation ID,
security revision, or persisted mutation category.

The canonical directory is computed from an event stream by
`projectStaffDirectory`. It orders events by occurrence time and then event
ID, and exposes `lastEventId` as a derived projection value. Neither the
projection nor that event ID independently proves a security transaction.
The existing event mutation classifier can classify recognized event
payloads, but a derived category is not persisted operation correlation.
Legacy events remain readable and are classified as legacy when no v1
metadata is present.

The new v1 TypeScript contract describes metadata separately from
`StaffEvent`; it does not add event types or reinterpret `StaffEventData`.
Its source identity and `writer_supplied_metadata` provenance describe the
metadata claim, not a trusted writer or an independently observed durable
record. A valid envelope means only that the supplied metadata is internally
consistent with one supplied event and the existing coordination contract.
Every classification remains non-authorizing, non-executing, and
non-retrying. It always reports that neither the security transaction nor
StaffEvents append has been independently verified.

## Proposed additive persisted envelope

A future writer may persist the immutable v1 envelope as additive metadata
associated with a StaffEvents entity. This design does not select a concrete
Azure property encoding; the existing `dataJson` and event semantics must
remain unchanged. The envelope includes:

- schema version, source identity, and evidence provenance;
- stable opaque operation ID, event ID, and staff ID;
- supported mutation category;
- expected and resulting security revisions;
- previous and resulting security states; and
- canonical Entra binding identity plus acquire/release transition and,
  for release, expected owner where applicable.

Entra identifiers must use the canonical `normalizeEntraStaffBinding`
validator. Mutation categories and state-transition checks reuse
`STAFF_WRITER_MUTATION_CATEGORIES` and
`evaluateStaffWriterCoordination`. Operation and event IDs are per-record
identity values; validating one envelope cannot establish global uniqueness.
Collection inspection detects duplicates only in the collection supplied to
that call.

The v1 compatibility classification is explicit:

| Input | Classification |
| --- | --- |
| Consistent v1 metadata and matching event | `valid` |
| Existing event with no metadata | `legacy` |
| Required fields absent or no independently supplied event | `incomplete` |
| Invalid values, identifiers, binding shape, or state spelling | `malformed` |
| Identity, category, release-owner, or revision contradiction | `contradictory` |
| Unknown schema version | `unsupported_schema_version` |

An unknown version is not parsed as v1. A legacy record is not backfilled
with guessed IDs or revisions. Partial metadata remains incomplete, and
conflicting replays remain contradictory rather than replacing earlier
evidence. An identical replay found within the inspected collection is
reported as such; it is not proof of globally unique storage.

## Future storage and transaction boundaries

The synthetic security prototype uses a fixed single partition for its
authority head, binding ownership, and operation receipt. That same-table,
same-partition transaction does not include StaffEvents. StaffEvents
currently uses `staffId` as its partition key and is appended through a
separate `createEntity` call. Azure Tables entity-group transactions cannot
span tables or partitions, so a security receipt and event append remain
separate operations and can have partial or uncertain outcomes.

If future storage uses stable keys for metadata, operation identity must
remain immutable and event identity must continue to participate in
StaffEvents row identity. A global operation uniqueness constraint across
staff partitions cannot be obtained from per-staff row keys alone; the
storage design must choose and prove a single-partition uniqueness authority
without claiming cross-table atomicity. Duplicate operation/event identities
must conflict, never upsert or silently overwrite prior evidence.

Any future coordinated writer must condition its security transition on the
expected security revision and current ETag, and must atomically create the
immutable operation receipt with that transition wherever the Azure Table
partition model permits. StaffEvents append is still a distinct write.
Conditional event creation must reject duplicate event identity. A stale
revision, duplicate receipt/event, or conflicting binding transition must
not produce a success-shaped partial record. Concurrent transitions need
storage-enforced conditional updates; caller checks alone are insufficient.
Acknowledgement loss is uncertain, not rejection, and must not trigger an
automatic retry or replay.

The security receipt and StaffEvents envelope should carry the same stable
operation/event/staff identities, category, revisions, and relevant binding
transition so independently read copies can be compared. Those matches
still do not prove atomicity. A security receipt without an event, an event
without a receipt, or missing metadata stays incomplete. A release or
reassignment makes an older binding acquisition historical; historical
ownership must not be presented as current ownership. Release evidence must
identify the expected owner and must not permit an earlier owner to release a
successor's binding.

Security revisions, not wall-clock event timestamps, are the intended
transition order. The current projection sorts by event timestamp then
event ID; timestamp order that differs from security revision order must be
reported as a diagnostic, not silently treated as proof of a security
ordering. Revision gaps, stale expected revisions, and nonconsecutive
transitions remain incomplete or contradictory until independently
reconciled. Existing historical events without metadata retain their
existing read behavior.

Reconciliation must not automatically retry, repair, synchronize, or replay
either write. Missing records do not prove that an uncertain write failed,
and replay can duplicate effects. Microsoft Graph is outside local Azure
Table transactions and remains outside this contract.

## Activation prerequisites

This design authorizes no migration, backfill, production writer
participation, OAuth execution, or feature flag. Before any such proposal:

1. Inventory all staff writers/readers and prove legacy-bypass prevention.
2. Specify additive serialization and compatibility rules for historical
   and partially written metadata.
3. Prove operation/event uniqueness, ETag concurrency, stale revision,
   binding reassignment, and uncertain acknowledgement behavior with
   isolated storage tests.
4. Define read-only reconciliation and explicit manual handling for gaps;
   do not infer missing evidence or automatically repair it.
5. Independently review production permissions, failure handling, and
   enforcement. Any Graph effects require their own idempotency and
   reconciliation proof.
6. Separately review and approve any future migration and writer rollout.

Until those gates are independently met, production OAuth readiness,
execution, and retries remain disabled.
