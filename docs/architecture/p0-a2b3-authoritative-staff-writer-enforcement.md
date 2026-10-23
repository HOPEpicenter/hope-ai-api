# P0-A2B-3: Authoritative Staff Writer Enforcement Architecture

Status: PROPOSED - NON-AUTHORIZING
Scope: Architecture and migration design only

## 1. Purpose

Define a candidate architecture for mandatory staff writer
participation, authoritative security ordering, global Entra
binding ownership, and canonical StaffEvents compatibility.

No production topology or rollout is approved.

## 2. Existing system constraints

Canonical StaffEvents currently uses:

- Table: StaffEvents
- PartitionKey: staffId
- RowKey: occurredAt__eventId
- Write method: createEntity

Existing staff directory and audit readers project canonical
StaffEvents history.

Current staff mutation pathways include:

- Staff identity creation
- Staff identity update
- Staff invitation creation
- Staff invitation activation

Synthetic coordination prototypes and reconciliation inspectors
do not enforce production writer participation.

## 3. Candidate topology

Preferred candidate for further evaluation:

A shared authoritative security partition, containing:

- Security authority head and generation
- Staff security state and revision
- Normalized Entra binding ownership
- Mutation operation identity
- Event correlation and append obligation
- Revocation and ordering records

Conditional ETags and a single-partition transaction would
provide candidate serialization for supported operations.

This is not an approved production architecture.

The shared partition may introduce contention, scalability,
transaction-size, and operational constraints.

A separately maintained canonical StaffEvents projection
would preserve existing reader and audit contracts.

Canonical projection updates are not assumed atomic with
the authoritative security transaction.

## 4. Decision register

### D1 - Storage partitioning and authority

Candidate: shared authoritative security partition.

Open: final table, partition keys, throughput, operational
ownership, recovery, and scaling constraints.

Required evidence: SDK-backed concurrency and capacity tests.

### D2 - Commit-time predicates

Candidate: conditional ordering-head ETag and create-only
operation and event identities within one atomic batch.

Open: exact schema, revision and generation rules, and
conflict semantics.

Required evidence: stale ETag, duplicate identity, rollback,
and ambiguous acknowledgement tests.

### D3 - Global Entra binding uniqueness

Candidate: normalized binding ownership rows in the shared
authority partition.

Open: transfer, release, replacement, invitation reservation,
and owner-conflict lifecycle.

Required evidence: concurrent acquisition across staff IDs,
replay, revocation, and ownership-transfer tests.

### D4 - Legacy writer write-access prevention

Candidate: remove authorization significance from canonical
StaffEvents and require all security-sensitive decisions to
read independently enforced authoritative security state.

This alone does not prevent direct legacy storage writes.

Open: deployment identity separation, storage permissions,
legacy access inventory, and a mandatory write-access fence.

Required evidence: an independently deployed legacy writer
cannot bypass authoritative authorization or overwrite
security state, even with direct StaffEvents write access.

Application-level conventions and feature flags alone
are insufficient proof.

### D5 - Canonical projection and read migration

Candidate: durable projection of committed security events
into the existing StaffEvents format.

Open: ordering, stable staff IDs, duplicate handling, event
payload compatibility, audit attribution, historical parity,
reconciliation, and reader migration.

Required evidence: projection parity, duplicate/conflict
detection, partial failure recovery, and rollback tests.

### D6 - Graph invitation reconciliation

Candidate: explicit durable invitation operation states.

Open: external success with local failure, duplicate requests,
ownership reservation, and uncertain acknowledgement.

Required evidence: isolated reconciliation and exactly-once
effect expectations with documented limitations.

No invitation sending is authorized.

### D7 - Session and credential coordination

Candidate: session and credential generations tied to the
same authoritative security revision and revocation order.

Open: lease boundaries, refresh behavior, replay handling,
and credential invalidation requirements.

Required evidence: claims and refreshes ordered against
revocations under concurrency.

### D8 - External executor cancellation

Candidate: independent execution fence checked immediately
before an external action and during supported cancellation
boundaries.

Open: lease expiry, mid-execution revocation, irreversible
external effects, and uncertain provider outcomes.

Required evidence: stale and fresh ETag claims fail after
revocation; external execution observes revocation fences.

### D9 - Rollback and failure recovery

Candidate: evidence-backed reconciliation, never blind retry.

Open: partial projection failures, unknown transaction
acknowledgements, historical data preservation, and rollback
authority.

Required evidence: ambiguous outcomes classified without
duplicating effects or losing revocation evidence.

### D10 - Rollout acceptance

Candidate: separately approved, staged adoption with
production execution gates initially disabled.

Open: measurable acceptance thresholds, independent reviewer
signoff, operational monitoring, and rollback triggers.

Required evidence: verified completion of D1-D9, production
writer inventory, compatibility tests, and security review.

## 5. Threat model

### T1 - Direct legacy StaffEvents append

An independent writer bypasses application-level gates and
appends directly to the canonical events table.

Required mitigation: canonical writes cannot independently
grant security authority; enforce appropriate storage access
separation and validate every authorization-sensitive reader.

### T2 - Competing binding assignments

Two staff identities attempt to claim the same normalized
Entra tenant/object identity.

Required mitigation: shared authoritative ownership record
with commit-time conflict detection.

### T3 - Revocation and execution race

An OAuth claim or external executor proceeds after revocation,
possibly with a newly read ETag.

Required mitigation: generation-aware revocation predicates
and independent execution fencing.

### T4 - Partial cross-table projection failure

The security transaction commits, but canonical StaffEvents
projection is missing or inconsistent.

Required mitigation: durable append obligations, evidence
reconciliation, and non-authorizing incomplete projections.

### T5 - Lost transaction acknowledgement

A transaction commits but its success acknowledgement is lost.

Required mitigation: durable operation identity and read-only
reconciliation before any separately approved retry.

### T6 - Historical reader incompatibility

A migration changes staff identity projections, audit ordering,
event semantics, or ministry relationships.

Required mitigation: historical parity tests and reversible
reader migration without deleting legacy records.

## 6. Migration sequence

A. Freeze and independently review the selected protocol.

B. Inventory all production writers, readers, bindings,
storage identities, and existing legacy access.

C. Build a disabled, non-authorizing storage adapter.

D. Prove transaction and concurrency behavior in isolated
Azurite and approved synthetic QA fixtures.

E. Prove mandatory staff writer participation and canonical
projection compatibility.

F. Prove migration reconciliation, legacy bypass resistance,
rollback, and uncertain-acknowledgement recovery.

G. Prove independent OAuth executor fencing and revocation.

H. Conduct a separately authorized rollout review.

No phase automatically authorizes the next.

## 7. Explicit safety restrictions

- storageProtocolReady: false
- executionPermitted: false
- retryPermitted: false

No production staff writer modification.
No canonical StaffEvents migration.
No staff or ministry data modification.
No Azure configuration or storage permission change.
No Graph invitation sending.
No OAuth activation or credential execution.
No automated recovery or retry.
No deployment or merge authorization.

## 8. Acceptance before implementation

Architecture review must establish:

- Exact authority and transaction boundary.
- Commit-time ordering and uniqueness predicates.
- Independently enforceable legacy-writer protection.
- Canonical reader and audit migration strategy.
- Graph invitation failure and reconciliation strategy.
- Session, credential, and external execution fencing.
- Safe rollback and unknown-outcome recovery.
- Objective regression and deployment acceptance criteria.

Research milestones and passing synthetic tests do not
establish production readiness.

This document proposes decisions for review; it does not
record final approval of D1-D10.
## 9. Legacy writer enforcement and migration threat review

Status: PROPOSED - NOT IMPLEMENTED

### 9.1 Authorization isolation

Canonical StaffEvents history must not independently grant
OAuth execution, binding ownership, or security authority.

All authorization-sensitive decisions must consume the
independently enforced authoritative security state.

Acceptance evidence must inventory and test every reader
that could otherwise infer authority from legacy projections.

### 9.2 Storage identity and permission isolation

Inventory production deployments, managed identities,
connection strings, shared keys, SAS credentials, and direct
storage clients without recording secret values.

The future authority boundary must prevent legacy writers
from modifying authoritative security records.

Storage permissions or equivalent independently enforceable
controls must be proven, not inferred from code conventions.

Shared account keys or broadly scoped credentials are a
potential bypass until their actual access is assessed.

No credential or permission changes are authorized here.

### 9.3 Projection provenance and integrity

Each trusted canonical projection must be traceable to a
committed authoritative operation or explicitly classified
historical legacy evidence.

Unknown, contradictory, missing, or unavailable authority
evidence must not silently confer authorization.

Cross-table projection updates must be treated as
non-atomic unless independently proven otherwise.

Direct legacy appends must be detected or isolated under
the eventual production migration protocol.

### 9.4 Binding ownership concurrency

The authoritative mechanism must reject conflicting
concurrent claims on the same normalized Entra binding.

Transfers, releases, invitation reservations, and replay
must preserve ownership history and ordering.

A directory pre-read alone is not an adequate uniqueness
mechanism.

### 9.5 Migration and rollback safety

Inventory legacy writers and readers before enforcing
a new authority boundary.

Maintain existing staff identity, ministry relationship,
event payload, actor, and audit contracts.

Preserve historical StaffEvents without deletion or silent
rewriting.

A partially migrated or unreconciled system must fail
closed for OAuth execution and retries.

Rollback must not restore an obsolete authorization grant,
binding owner, or revocation generation.

### 9.6 Unknown acknowledgement and recovery

Unknown transaction outcomes require durable operation
identity and independent evidence inspection.

No blind retry, duplicate external invitation, or execution
claim may follow ambiguous acknowledgement.

Reconciliation may classify evidence but does not itself
grant an execution permit.

### 9.7 Required independent acceptance evidence

Before implementation or rollout approval, prove:

- A direct legacy StaffEvents append cannot grant authority.
- A legacy deployment cannot overwrite security state.
- Every authorization-sensitive reader rejects legacy bypass.
- Concurrent binding acquisition allows only one owner.
- Unverified projections cannot confer security authority.
- Reconciliation detects missing or contradictory evidence.
- Unknown outcomes do not enable blind retries.
- Revocation remains effective after rollback.
- Historical staff directory and audit reads remain compatible.
- All execution and retry gates remain disabled by default.

These checks require implementation-specific tests and
independent CI evidence. They are not currently satisfied
by this documentation milestone.

No production topology, storage permission change, migration,
external execution, or OAuth activation is approved.
