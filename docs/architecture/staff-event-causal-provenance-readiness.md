# StaffEvent Causal-Provenance Readiness v1

Status: pure, nonauthorizing design contract. No production activation.

## Purpose

This contract classifies summarized evidence about the relationship
between a committed staff security operation and a StaffEvents append.

It deliberately does not claim that the current architecture proves
causal attribution or globally unique operation identities.

Implementation:

- `src/contracts/staffEventCausalProvenanceReadiness.v1.ts`
- `tests/authorization/staffEventCausalProvenanceReadiness.test.ts`

## Evidence inputs

The classifier accepts six exact fields:

1. `schemaVersion`: version 1.
2. `securityReceipt`: observed, missing, contradictory, or unavailable.
3. `appendIntent`: recorded, not_required, legacy_unclassified,
   missing, contradictory, or unavailable.
4. `staffEvent`: verified_match, missing, contradictory, unavailable,
   or unclassified.
5. `operationUniqueness`: not_proven, duplicate, or unavailable.
6. `causalLink`: writer_claim_only, missing, contradictory, or unavailable.

These are caller-provided summaries, not independently authenticated
storage evidence. The classifier performs no I/O and cannot establish
whether an upstream evidence summary is truthful or complete.

## Readiness classifications

| Status | Interpretation |
| --- | --- |
| consistent_but_unproven | All expected observations agree, but causation and global uniqueness remain unproven |
| insufficient_evidence | One or more required observations are absent, historical, or unclassified |
| contradictory | At least one recognized source explicitly reports conflicting or duplicate evidence |
| unavailable | At least one necessary evidence source cannot be inspected |
| unsupported | Schema, field, value, or object representation is not supported |

Unknown or future schema versions cannot be interpreted as success.
Recognized contradictions take precedence over unavailable evidence.
Malformed inputs are unsupported rather than guessed into another state.

## Evidence limits

A matching StaffEvents record and a matching immutable intent can
demonstrate observational agreement. They do not establish that the
committed operation caused the event write.

`writer_supplied_metadata` is an assertion by a writer, not an
independently authenticated writer identity or execution attestation.

The existing per-staff StaffEvents keys cannot establish global
operation uniqueness. Duplicate identity detection within a supplied
collection is not proof of exhaustive storage coverage.

Separate security and StaffEvents reads are not one atomic snapshot.
An uncertain acknowledgement remains uncertain. A missing record
must not be treated as proof that retrying is safe.

Historical operations, released or reassigned Entra bindings, and
revision gaps must not be reclassified as currently authoritative
merely because event payloads match.

## Explicit safety guarantees

Every returned result has:

- `causalProvenanceVerified: false`
- `globalOperationUniquenessVerified: false`
- `authoritative: false`
- `executionPermitted: false`
- `retryPermitted: false`
- `securityTransactionVerified: false`
- `staffEventsAppendVerified: false`

`consistent_but_unproven` is not an authorization or recovery outcome.

The contract does not read or write Azure storage, send communications,
execute Graph or OAuth actions, create a staff event, retry a write,
repair a record, or change ministry data.

## Future proof obligations

Any proposal for independently verifiable causal provenance requires
a separately reviewed persistence and execution design that addresses:

1. An authoritative, storage-enforced operation uniqueness mechanism.
2. Immutable operation and event identities across evidence records.
3. Security transition revision and ETag concurrency enforcement.
4. Event creation and acknowledgement-loss handling without unsafe replay.
5. Independent evidence of the writer's authorized execution context.
6. Tampering, missing records, stale evidence, and concurrent changes.
7. Historical compatibility, sensitive-data minimization, and access controls.
8. Operational handling of unresolved and contradictory evidence.

A signed or hashed writer claim alone does not establish cross-table
atomicity or prove that a specific authorization transition caused an
event append.

## Activation boundary

This version is a pure classifier and authorizes no production writer
integration, migration, new storage infrastructure, feature-flag change,
retry mechanism, or automatic recovery.

Production integration requires an independent security review and
an explicit subsequent approval.
