# Enforceable Staff and OAuth Coordination Protocol

Status: proposed design, not implemented
Baseline: PR #1332, e08ccf5c9ea7f43194900dd3b2b9a055c1ad7796

## 1. Purpose

Define an implementation-ready security protocol for staff
identity, Entra binding ownership, revocation ordering, and
eventual OAuth execution fencing.

This document does not authorize OAuth execution or retries.

Mandatory current invariants:

- storageProtocolReady=false
- executionPermitted=false
- retryPermitted=false

Synthetic Azurite tests are feasibility evidence only.

## 2. Current production architecture

StaffEvents stores staff events with:

- Table: StaffEvents
- PartitionKey: staffId
- RowKey: occurredAt__eventId

StaffEventsRepository.append uses createEntity.

readCanonicalStaffDirectory projects StaffEvents.listAll.
Binding lookup scans the projected directory.
A first matching identity is returned by the binding lookup.

Production mutation pathways include:

1. createStaffIdentity
2. updateStaffIdentity, including deactivation
3. createStaffInvitation
4. activateStaffInvitation

These pathways do not currently commit staff events and
OAuth ordering decisions within a shared atomic transaction.

createStaffInvitation performs its external Microsoft
invitation before the local StaffEvents append.

readMutationActorStaffIdentity supports a registry
compatibility fallback that may return status active.
This is not evidence of current coordinated authorization.

resolveVerifiedEntraStaffIdentity verifies the token,
requires exactly one canonical binding match, and
requires the matched identity to be active.
Those guarantees must be retained.

## 3. Security invariants

S1. No two staff identities may own one normalized
tenant/object binding at the same authoritative revision.

S2. Every authorization-sensitive staff mutation must
participate in the selected ordering protocol.

S3. Staff deactivation and an OAuth execution claim
must contend against the same relevant security authority.

S4. An OAuth claim after revocation must be rejected,
including one using a fresh ETag acquired after revocation.

S5. Historical StaffEvents must not be deleted or silently
rewritten to create a new authority.

S6. Duplicate mutation or event identities must not
produce duplicate authoritative effects.

S7. Ambiguous transaction acknowledgements must be
reconciled against durable operation identity and state.

S8. Legacy writes must not independently authorize
staff access or OAuth execution.

S9. External execution must independently enforce
cancellation and revocation fencing.

S10. Rollout must fail closed on incomplete migration,
conflicting bindings, stale revisions, or unknown state.

## 4. Candidate authoritative topology

Evaluate a shared security-coordination table with a
well-defined partitioning and serialization protocol.

Candidate records include:

- Authority head: revision, state, generation, ETag
- Binding ownership: normalized binding key and owner
- Staff security state: staffId, active/revoked state
- Operation identity: operationId, expected revision
- Ordering event: eventId, operation kind, revision
- Reconciliation state: pending, committed, uncertain,
  rejected, or repaired with explicit evidence

These are conceptual records, not finalized schemas.

A single shared partition permits atomic batches involving
the records within that partition, but may introduce
contention, throughput, size, and operational constraints.

Per-staff partitioning alone cannot atomically enforce
global uniqueness for a binding shared across staff IDs.

The implementation must explicitly resolve whether
authority is globally serialized, sharded by binding with
additional cross-partition protocol, or implemented through
another enforceable storage mechanism.

No production topology is approved by this document.

## 5. Binding ownership

A canonical directory pre-read is not a sufficient
reservation or uniqueness guarantee.

Define atomic or otherwise provably serialized operations
for:

- Initial binding acquisition
- Conflicting concurrent acquisition
- Idempotent replay
- Same-owner update
- Binding replacement
- Ownership transfer between staff IDs
- Release and reassignment
- Deactivation with retained audit history
- Invitation reservation and activation

Normalization must reuse canonical Entra GUID handling.

The protocol must fail closed for ambiguous ownership.

Cross-owner replacement cannot assume two independent
partition writes are atomic.

## 6. Staff writer enforcement

Every production staff mutation entry point must be
inventoried and mapped to the authoritative protocol.

Writer integration must preserve:

- Canonical staffId
- Existing staff event types and payload semantics
- Actor attribution and audit history
- Ministry Area relationships
- Staff invitation lifecycle
- Existing administrator authorization
- Replay/idempotency behavior

A successful StaffEvents append must not substitute for
an authoritative security commit.

The implementation must specify how uncoordinated
legacy writes are prevented, quarantined, or excluded
from authorization, including direct storage access.

Do not treat application-level conventions alone as
proof that independent storage writers are prevented.

## 7. Canonical readers and compatibility

Existing staff directory and audit read contracts must
remain compatible during migration.

Required reader inventory includes:

- Staff administration
- Verified Entra identity resolution
- Administrator and pastoral authorization
- Care and Six-Week staff ownership
- Ministry Area leaders and staff rosters
- Communications and activity workflows

The authoritative security decision must reject:

- Missing binding ownership
- Duplicate ownership
- Revoked or inactive security state
- Stale revision
- Uncoordinated compatibility fallback
- Conflicting projection/authority evidence

A compatibility identity marked active must not by itself
grant OAuth execution or establish a security fence.

Define reconciliation between StaffEvents projections
and authoritative coordination state.

## 8. Microsoft invitation ordering

Microsoft Graph is outside Azure Tables transactions.

Do not claim that an invitation API call and storage
transaction commit atomically together.

Design a durable invitation operation with:

- Stable operation identity
- Binding reservation state
- External request correlation
- Evidence of external outcome
- Idempotent reconciliation
- Explicit uncertain-result handling
- Safe compensation or manual recovery where needed

Prevent duplicate invitations from accidental retries.
An external success with failed local persistence must
not silently create an authorized staff identity.

No live invitations are authorized by this milestone.

## 9. OAuth claim and revocation semantics

The authoritative protocol must define:

- Eligible staff state at the commit decision
- Session and credential revocation generations
- Execution claim and cancellation ordering
- Commit-time state predicates
- What a successful claim permits, if anything
- What happens when revocation follows a claim
- Handling of in-flight external operations
- Ambiguous execution and acknowledgement outcomes

ETag compare-and-swap alone is insufficient when the
caller obtains a fresh ETag for an already revoked head.

A subsequent claim must still fail because the
authoritative state is revoked.

No claim may authorize external execution until the
executor independently enforces the same fence.

## 10. Migration and rollout sequence

Phase A: freeze protocol contracts and tests.

Phase B: inventory and reconcile existing bindings,
staff identities, legacy writers, and projections.

Phase C: introduce new storage adapter in disabled,
non-authorizing mode.

Phase D: exercise synthetic Azurite and isolated QA
fixtures, with all production execution gates false.

Phase E: prove all write pathways enforce the new
authority without breaking canonical reads.

Phase F: prove durable migration reconciliation,
conflict detection, rollback, and no legacy bypass.

Phase G: prove independent external execution fencing,
cancellation, and uncertain-acknowledgement recovery.

Phase H: conduct separately approved rollout review.

No phase automatically enables another.

No production migration, role change, Azure permission
change, or feature toggle is approved here.

## 11. Required acceptance tests

- Multiple concurrent writers contend for one binding.
- Same binding across different staff IDs is rejected.
- Rebinding and ownership transfer preserve history.
- Staff deactivation races an execution claim.
- Fresh-ETag claim after revocation is rejected.
- Duplicate event identity rolls back the full mutation.
- Unknown transaction outcome is durably reconciled.
- Duplicate invitation requests do not duplicate effects.
- External invitation success and local failure are safe.
- Existing authorized readers retain expected behavior.
- Registry compatibility fallback cannot grant OAuth.
- Direct legacy append cannot bypass authorization.
- Canonical projections detect conflicting evidence.
- Session and credential revocations share ordering.
- Executor observes a fence before external action.
- Revocation during external action is handled safely.
- Legacy records remain readable and auditable.
- Rollback leaves execution and retry gates disabled.

These tests require implementation and independent CI
evidence; prior synthetic tests do not satisfy them all.

## 12. Decisions required before production coding

D1. Select exact storage partitioning and authority.

D2. Select the commit-time predicate mechanism.

D3. Select a global binding uniqueness mechanism.

D4. Specify legacy writer write-access prevention.

D5. Specify canonical projection and read migration.

D6. Specify Graph invitation state and reconciliation.

D7. Specify session and credential coordination.

D8. Specify external executor cancellation semantics.

D9. Define rollback and failure recovery procedures.

D10. Define objective rollout acceptance criteria.

## 13. Explicit non-goals

This milestone does not:

- Modify production staff writers
- Modify real staff identities or ministry data
- Migrate StaffEvents
- Send invitations
- Change Azure app settings or storage permissions
- Grant OAuth execution
- Permit retries
- Implement the HOPE Movement Pathway

The HOPE Movement Pathway remains a separately scoped
future people-development architecture enhancement.

## 14. Proposed implementation milestones

Milestone 1: Authoritative protocol and migration design.

Milestone 2: Storage adapter, binding ownership,
transaction predicates, and synthetic acceptance tests.

Milestone 3: Coordinated staff writers, invitation
reconciliation, canonical compatibility, and tests.

Milestone 4: OAuth session/credential coordination,
external fencing, recovery, and rollout safeguards.

Each implementation milestone requires a focused draft PR,
independent CI, and an explicit safety review.

Completion of a research milestone never automatically
grants production execution readiness.
