# P0-A2B-2: Synthetic Staff Writer Fencing Proof

## Purpose

Demonstrate fail-closed classification of synthetic staff writer
coordination evidence without changing canonical production writers.

This work is research evidence, not production enforcement.

## Scope

New synthetic contract:

- src/domain/staff/staffWriterFencingProof.ts

New regression suite:

- tests/authorization/staffWriterFencingProof.test.ts

No production staff commands, HTTP endpoints, canonical StaffEvents
repositories, storage configuration, or OAuth execution paths change.

## Existing contracts reused

The synthetic assessment delegates coordination classification to
evaluateStaffWriterCoordination.

It preserves established operation identity, event identity, staff
identity, mutation category, and security-revision comparisons.

It does not establish a new authoritative storage mechanism.

## Synthetic assessment results

Possible statuses:

- candidate_consistent
- blocked

A candidate_consistent result describes matching historical evidence.

It never grants permission to perform a new write.

Every assessment returns:

- authoritative: false
- executionPermitted: false
- retryPermitted: false
- productionWriterFenced: false

## Fail-closed cases

The test suite checks:

- Missing security decision evidence.
- Pending security decision evidence.
- Stale expected security revision.
- Contradictory operation identity.
- Uncertain security evidence.
- Uncertain StaffEvents persistence evidence.
- Missing StaffEvents persistence evidence.
- Invalid runtime evidence.
- Matching historical evidence remains non-authorizing.

A synthetic mock writer consulting the assessment never invokes
its simulated persistence operation, including when evidence is
historically consistent.

This is not proof that an independent writer cannot bypass the
assessment altogether.

## Local validation

The following focused regression suites passed:

- staffWriterCoordinationContract.test.ts
- staffWriterMigrationReadiness.test.ts
- staffWriterParticipationSafetyProof.test.ts
- staffWriterFencingProof.test.ts

TypeScript validation passed using:

tsc --noEmit --incremental false

## Not established

This work does not prove:

- Production legacy-writer fencing.
- Storage-layer enforcement of a mandatory writer gate.
- Canonical StaffEvents participation in the security transaction.
- Cross-table or cross-partition atomicity.
- Global Entra binding uniqueness in production.
- Protection against unparticipating or independently deployed writers.
- Safe recovery following uncertain acknowledgements.
- Production OAuth execution or credential mutation authorization.
- End-to-end projection and historical audit parity.

In particular, StaffEvents currently uses a canonical per-staff
partition and a direct createEntity append. The synthetic security
transaction uses a separate partition.

An observationally matching append cannot bridge that atomicity gap.

## Required future work

Before production writer migration:

1. Establish an authoritative ordering and binding ownership design.
2. Enforce writer participation across every production mutation path.
3. Prevent direct legacy writes from bypassing the selected gate.
4. Prove canonical projection and historical audit compatibility.
5. Prove concurrent writer, rollback, revocation, and uncertain
   acknowledgement behavior.
6. Review storage-access enforcement independently.
7. Obtain separate authorization for any production integration.

## Operational restrictions

- storageProtocolReady: false
- executionPermitted: false
- retryPermitted: false

No production data mutation, OAuth activation, Azure configuration
change, automated repair, retry, deployment, or merge is authorized.

This milestone is non-authorizing synthetic design evidence only.