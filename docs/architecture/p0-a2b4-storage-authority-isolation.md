# P0-A2B-4: Storage Identity and Authority Isolation

Status: PROPOSED - NON-AUTHORIZING
Scope: Documentation and synthetic test design only

## 1. Objective

Define how authoritative staff security records can be
isolated from legacy writers and uncoordinated StaffEvents
operations.

This document does not approve a production topology,
credential change, permission change, or migration.

## 2. Existing evidence

The backend contains:

- StaffEventsRepository with direct createEntity append.
- Synthetic staff operation correlation transactions.
- Synthetic atomic event transition transactions.
- StaffEvents append-intent and reconciliation inspectors.
- Staff writer migration-readiness gates.
- Isolated Azurite tests for contention, rollback,
  duplicates, and ambiguous acknowledgements.

The integrated OAuth topology Azurite test demonstrates
that an independent legacy-table append remains possible
without changing the security authority revision.

Existing synthetic tests do not prove production Azure
identity or permission isolation.

## 3. Candidate trust boundaries

### B1 - Authoritative security storage

Only explicitly approved security writer identities should
be permitted to modify authoritative staff state, binding
ownership, operation receipts, revocation generations,
and security transaction ordering records.

Enforcement must be independent of the application
code path used by a legacy writer.

### B2 - Canonical StaffEvents storage

Canonical StaffEvents may preserve historical projections
and existing directory and audit compatibility.

A StaffEvents append alone must never establish OAuth
execution authority, binding ownership, or revocation
state.

### B3 - Authorization-sensitive readers

Every authorization-sensitive reader must use trusted
authoritative security evidence.

Compatibility projections cannot independently grant
security execution permissions.

### B4 - External executors

External execution must check independently enforced
revocation and cancellation conditions.

Successful storage evidence alone cannot authorize
external execution.

## 4. Candidate identity model

Evaluate distinct identities for:

- Authoritative security transaction writers.
- Canonical event projection writers.
- Legacy staff mutation deployments.
- Read-only authorization and reconciliation services.
- Independent external executors.

The final design must identify effective permissions,
deployment boundaries, credential distribution,
and whether any identity can bypass role separation.

Identity separation without enforceable storage access
restrictions is not proof of isolation.

## 5. Credential and permission threats

### T1 - Shared account key

A legacy deployment possessing a broadly privileged
storage account key may bypass intended role separation.

### T2 - Shared connection string

Multiple deployments may inherit equivalent authority
through shared storage connection configuration.

### T3 - Excessive data-plane permissions

An identity with broad table-write permissions may
modify security authority outside the coordinated writer.

### T4 - Canonical projection spoofing

A legacy writer may inject or alter StaffEvents evidence
that appears compatible with canonical historical data.

### T5 - Stale authorization readers

A reader may grant authorization using canonical
StaffEvents without consulting the current authority.

### T6 - Revocation and rollback bypass

A restored legacy projection or old security generation
may incorrectly appear authorized after revocation.

### T7 - Uncertain storage acknowledgement

A writer may retry after an ambiguous transaction
outcome and duplicate effects or violate ordering.

## 6. Isolation requirements

R1. An independent legacy writer must be unable to
modify authoritative security records.

R2. A canonical StaffEvents append must not independently
grant security execution authority.

R3. All authorization-sensitive read paths must be
inventoried and verified against trusted authority.

R4. Credential possession and effective permissions
must be evaluated, not inferred from nominal roles.

R5. Binding ownership must remain globally unique
under concurrent acquisition and ownership transfer.

R6. Projection provenance must distinguish committed
authority evidence from unverified historical records.

R7. Missing, conflicting, or unavailable evidence
must fail closed.

R8. Rollback must not reinstate revoked authority.

R9. Unknown acknowledgements must not trigger blind
retries or external execution.

R10. Staff directory, invitation, ministry relationship,
and audit compatibility must be preserved.

## 7. Proposed synthetic acceptance tests

P1. An authorized synthetic writer commits a valid
security transaction with required evidence.

P2. A simulated legacy writer attempts direct
security-state mutation and is denied by the chosen
test enforcement boundary.

P3. A direct StaffEvents append does not change
authoritative revision or grant OAuth execution.

P4. A conflicting binding acquisition fails atomically.

P5. A forged or contradictory canonical projection
remains non-authorizing.

P6. A missing append obligation or event results in
an explicit incomplete reconciliation state.

P7. A stale security generation cannot authorize
after revocation or rollback.

P8. An uncertain transaction acknowledgement does
not permit automatic retry or external execution.

P9. Existing authorized canonical readers preserve
their documented compatibility behavior.

P10. Synthetic proof clearly distinguishes a
mocked application denial from an independently
enforced storage denial.

Existing tests should be reused wherever possible.
These scenarios are acceptance requirements, not
claims of completed implementation.

## 8. Production verification prerequisites

Before any production rollout, separately verify:

- Deployment identities and their actual scope.
- Credential and connection-string distribution
  without displaying secret contents.
- Effective storage data-plane permissions.
- All direct staff event and authority writers.
- Every authorization-sensitive read path.
- Credential rotation and rollback requirements.
- Independent denial of legacy authority writes.
- Revocation and external-execution fencing.
- Independent CI and operational review evidence.

Azure RBAC configuration alone may not establish
isolation if shared-key access or other privileged
credential paths remain available.

No production credentials are inspected here.

## 9. Migration and rollback controls

1. Approve the final authority and identity topology.
2. Inventory existing deployments and access paths.
3. Establish synthetic denial and compatibility proofs.
4. Independently verify storage access restrictions.
5. Demonstrate writer and reader migration safety.
6. Prove durable reconciliation and rollback behavior.
7. Prove external executor cancellation and revocation.
8. Request separate production rollout authorization.

A research milestone never enables a later phase
automatically.

## 10. Explicit safety restrictions

- storageProtocolReady: false
- executionPermitted: false
- retryPermitted: false
- productionWriterFenced: false

No production code changes.
No real staff or ministry data changes.
No Azure configuration or permission changes.
No production credential access or rotation.
No canonical StaffEvents migration.
No Graph invitation sending.
No OAuth execution or automatic retries.
No production deployment.

## 11. Open decisions

D1. Select exact authoritative storage topology.

D2. Select effective credential and identity isolation
mechanism, including shared-key threat mitigation.

D3. Define independently enforceable legacy writer
denial and its objective verification procedure.

D4. Specify canonical projection provenance and
authorization-reader migration.

D5. Define rollback, recovery, and permission
restoration requirements.

D6. Define acceptance evidence required before
production storage changes.

These remain unresolved pending independent review.

This document does not authorize production
security changes or claim enforcement readiness.