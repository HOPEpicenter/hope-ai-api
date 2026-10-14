# StaffEvent Append Evidence Reconciliation

Status: isolated synthetic read-only prototype. Not production-authoritative.

## Purpose

`inspectStaffEventAppendEvidence` compares three evidence sources:

1. A security operation receipt and append obligation inspected using
   `StaffOperationCorrelationPrototypeRepository.inspectOperation`.
2. The persisted immutable append intent, separately retrieved and
   validated against that security receipt.
3. A StaffEvents entity independently retrieved by its expected
   staffId and occurredAt__eventId storage identity.

The service accepts explicit Azure Table clients. It does not create
production connections or modify any storage records.

## Classification

| Status | Meaning |
| --- | --- |
| verified_match | Independently observed StaffEvents fields and payload match the validated append intent |
| missing | Security receipt or expected StaffEvents record was not found |
| contradictory | Inspected records conflict, are malformed, or visibly change during inspection |
| unavailable | Required storage evidence cannot be read reliably |
| unclassified | Available evidence does not establish a required, validated append intent |

A missing StaffEvents record does not prove an append never happened,
especially following uncertain acknowledgements.

`verified_match` is observational evidence only. It does not establish
which writer created the event, why it was created, global operation
uniqueness, or cross-table transaction atomicity.

## Read consistency

The service performs independent reads without a shared transaction.

After matching the expected StaffEvents record, it repeats the security
inspection and intent retrieval and checks for visible disagreement.

This detects some concurrent changes, but is not a transactional
snapshot. It cannot exclude an ABA change between reads, concurrent
changes after inspection, or tampering that preserves the observed
values. An ETag or timestamp from a single table cannot make a
cross-table observation atomic.

The intended receipt and append-intent records are create-only.
Synthetic tests may deliberately mutate their isolated fixtures to
prove fail-closed behavior. Such mutations are not production commands.

## Non-authorizing boundary

Every classification returns:

- authoritative: false
- executionPermitted: false
- retryPermitted: false
- securityTransactionVerified: false
- staffEventsAppendVerified: false

These flags remain false even for verified_match.

The service cannot append, dispatch, repair, recover, or replay
StaffEvents. It performs no Graph or OAuth execution.

## Privacy and deployment

Append-intent JSON can contain contact details and Entra identifiers.
This prototype does not approve production access, logging, retention,
migration, or writer integration. Tests use isolated synthetic Azurite
tables only.

Before any production activation, independently review authorization,
sensitive-data handling, event provenance, uniqueness, read consistency,
and all staff writer paths. This PR grants no production rollout.