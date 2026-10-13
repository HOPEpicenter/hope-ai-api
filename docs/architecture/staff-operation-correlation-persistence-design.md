# Staff Operation Correlation Persistence Design

Status: proposed persistence design; no production implementation or
authorization behavior is enabled.

This design follows the coordination, reconciliation, and correlation
contracts in PRs #1337, #1338, and #1339. It documents future persistence
boundaries only. The existing correlation evaluator's `complete` result means
internal consistency of supplied evidence; it is not source verification,
production authorization, or proof of a cross-store transaction.

Required invariants:

- `authoritative: false`
- `executionPermitted: false`
- `retryPermitted: false`
- `storageProtocolReady: false` until independently proven
- No automatic replay, retry, or recovery write

## 1. Current persisted records

### Security binding store

`OAuthStaffSecurityStorageRepository` receives one injected `TableClient`.
The repository does not select or provision a production table name. Its
isolated tests create random tables. The prototype layout is:

| Record | PartitionKey | RowKey | Persisted facts |
| --- | --- | --- | --- |
| Shared authority head | `staff-security-prototype-v1` | `ordering-head` | revision, active/revoked state, service ETag |
| Binding ownership | `staff-security-prototype-v1` | `binding-{tenantId}-{objectId}` | staff ID, normalized tenant/object IDs, acquisition operation ID, active/released state; release owner, operation ID, and revision after release |
| Operation receipt | `staff-security-prototype-v1` | `operation-{operationId}` | operation ID, staff ID, tenant/object IDs, `binding.reserved` or `binding.released`, resulting authority revision |

The reservation and release methods conditionally update the shared head and
binding row and create an immutable receipt in one `submitTransaction` call.
All these actions use the same injected table and partition. An operation-row
create conflict or stale conditional update aborts that same-partition batch.
Unknown transaction acknowledgements return uncertain and are not retried.
This prototype is isolated, requires an existing active head, and is not wired
to production staff writers or OAuth execution.
The Azurite integration test creates random tables with the `OauthSecurityIT`
prefix; this is test-only naming, not a production table name. Earlier active
binding rows may omit `ownershipState`; the repository interprets that legacy
shape as active when validating it. A missing ownership marker is therefore a
compatibility case in this prototype, not a durable cross-store correlation
field.

These records do **not** persist a StaffEvents event ID, staff mutation
category, expected revision, or previous/resulting staff security state.
Existing receipt kinds describe binding reservation/release, not complete
staff-writer coordination. A binding's acquisition operation ID does not
prove that the binding is still current; release and later acquisition change
ownership state and operation identity.

### StaffEvents

`StaffEventsRepository` writes the `StaffEvents` table using:

- `PartitionKey = staffId`
- `RowKey = occurredAt + "__" + eventId`
- event ID, staff ID, event type, occurrence time, actor ID, and serialized
  event data

It calls `createEntity` independently. The persisted entity has no security
operation ID, security revision, or explicit mutation category field. Event
type and payload can be classified, but classification is not persisted
cross-store correlation. Duplicate event writes conflict on the row key; they
are not transactionally coupled to a security receipt.

### Canonical staff projection

`readCanonicalStaffDirectory` obtains StaffEvents and calls the pure
`projectStaffDirectory` function. The canonical identity contains profile and
status values, Entra binding values, and `lastEventId`. It is currently a
derived read model, not a separately persisted projection row. It contains no
operation ID or security revision. `lastEventId` can indicate which event
produced the computed projection, but alone cannot prove that the matching
security operation committed.

### Entra binding ownership

The prototype binding record is in the security table's shared prototype
partition. It stores active/released ownership, acquisition operation ID,
and release-specific evidence. Its ETag is used for conditional `update`
actions; release does not physically delete the row. This is separate from
the Entra binding copied into a StaffEvents payload or canonical projection.
Those copies are not the authoritative current owner.

### Microsoft Graph invitation outcome

No existing durable Graph outcome record is provided by these repositories.
The coordination/correlation contracts can represent invitation outcomes,
but those types do not establish that production persists the outcome. Graph
is outside an Azure Tables transaction; a Graph response and any local write
cannot be claimed atomic.

## 2. Actual transaction boundaries

Azure Table entity-group transactions are limited to entities in the same
table and the same `PartitionKey`. The current security prototype uses this
boundary for its head, binding ownership row, and operation receipt. The
StaffEvents write targets the named `StaffEvents` table and uses `staffId` as
its partition key. The security table name is selected by the injected client
and is not a fixed production name. No production wiring establishes that the
security client is the `StaffEvents` table or that its partition key matches
the staff ID. More importantly, the security repository's batch does not
include a StaffEvents action, and `StaffEventsRepository.append` makes a
separate `createEntity` call. The repository explicitly avoids modifying
StaffEvents.

Therefore:

1. A security head + binding + security receipt transaction is demonstrated
   only for the isolated same-table, same-partition prototype.
2. A StaffEvents append is a separate single-entity write in `StaffEvents`.
3. The current code does not combine the security batch and StaffEvents
   append. If their future physical tables or partition keys differ, Azure
   Tables cannot combine them in one entity-group transaction; current code
   does not prove matching placement even in the case where names/keys happen
   to coincide.
4. Projection application is currently an in-memory computation, not a
   persisted transactional action.
5. Microsoft Graph is outside Azure Tables and all local storage transactions.

Neither a successful pair of independent writes nor matching IDs converts
these boundaries into atomicity. ETag conditionals fence the records actually
included in a same-partition batch; they do not fence records in another
table or partition.

## 3. Proposed durable correlation envelope

Future schema work should use one stable opaque `operationId` and one stable
`eventId` allocated before either local write. A versioned immutable operation
record should include at minimum:

| Field | Purpose |
| --- | --- |
| schema version | Explicitly version decoding and migration semantics |
| operation ID, event ID, staff ID | Stable correlation identity |
| mutation category | The supported coordination-contract category |
| expected and resulting security revisions | Bind the operation to a single ordered transition |
| previous and resulting staff security states | Describe the transition, not merely a successful write |
| canonical Entra tenant/object IDs, when relevant | Reuse canonical Entra binding normalization |
| outcome and reason | Distinguish committed, rejected, pending, and uncertain observations |
| source record keys and persistence status | Identify independently observed durable records |
| record creation/observation time and actor | Audit provenance without treating time as ordering authority |

The operation identity must be unique at the storage layer, not merely unique
in the request. Creating a duplicate operation receipt must fail atomically
with the corresponding head/binding update. Receipts and correlation records
are append-only; corrections are new records linked to the original, not
silent overwrites.

The correlation contract has three independent questions:

1. **Correlation identity:** do the independently read records carry the same
   operation, event, staff, category, and applicable binding identities?
2. **Persistence evidence:** did the named source durably persist the exact
   record, and can an independent reader retrieve it?
3. **Current security authority:** does the latest authoritative head and
   binding state still support the relevant operation?

Caller-supplied IDs, asserted success booleans, a Graph response, and a
canonical projection alone answer none of the latter two questions.

## 4. Proposed write and projection protocol

This is a staged protocol, not a distributed transaction:

1. **Prepare identity:** allocate stable operation/event IDs and expected
   revision. Validate canonical staff and Entra identities. Persisting a
   durable intent record is a future requirement; no current writer does so.
2. **Commit security decision:** in the chosen authoritative security
   partition, compare-and-swap the authority head and conditionally transition
   binding ownership as needed. In that same Azure Table transaction, create
   an immutable receipt containing operation ID, event ID, staff ID,
   mutation category, expected/resulting revision, previous/resulting state,
   binding identity, and outcome. A rejection is recorded as a distinct
   result and must not be represented as a successful transition.
3. **Append StaffEvents:** after a confirmed security commit, independently
   create the event with the same operation ID and resulting security
   revision in explicitly versioned correlation fields. Existing event
   schema does not contain those fields. Failure or unknown acknowledgement
   leaves an incomplete/uncertain operation, not a rollback of security state.
4. **Apply projection:** projection processing must durably record the exact
   event ID, operation ID, staff ID, resulting security revision, and
   projection generation/checkpoint that it applied. If a stored projection
   is introduced, update it conditionally and prove the exact event applied.
   A stale projection checkpoint remains pending/incomplete. Today the
   projection is derived and has no such persisted application proof.
5. **Observe independently:** readers fetch source records by stable
   identities from the sources themselves and verify source keys, identities,
   revisions, and states. A caller cannot submit evidence in place of these
   reads. Separate reads are not a simultaneous snapshot; current ownership
   must be read independently and treated as time-bounded evidence, not a
   capability.

The current code does not place steps 2 and 3 in one transaction. If their
future physical tables or partition keys differ, Azure Tables cannot combine
them in one entity-group transaction; current code does not prove matching
placement even if table names and keys happen to coincide. A future design
could place a durable intent/outbox in the security partition to make the
security commit and the obligation to append an event atomic. It still cannot
make the StaffEvents append atomic with that security commit. Such an outbox
is a design option requiring a separate review, not an existing record or
approved implementation.

## 5. Binding ownership and historical evidence

The security binding row—not a historical receipt, event payload, or
projection—is the source to inspect for current ownership. A read must verify
the owner, normalized tenant/object IDs, `ownershipState`, acquisition
operation ID, release evidence, and relation to the observed authority
revision. A released row or a row reacquired under another operation is
historical for the earlier operation. A stale ETag/head revision, malformed
row, duplicate owner, absent authority head, or unavailable read fails
closed.

Release and reacquisition must remain conditional transitions. The
operation receipt is immutable historical evidence; it cannot establish that
the original owner still owns the binding. Current ownership observations do
not prove that a subsequent competing transition has not occurred unless an
enforcing commit-time transaction consumes the corresponding revision.

## 6. Invitation outcome boundary

Persist a local invitation intent before calling Graph, using the same stable
operation ID. Record the Graph request/correlation identifier where
available, request attempt identity, outcome, observation time, and evidence
source in a durable local record. Keep the Graph result explicitly separate
from security receipt, StaffEvents persistence, and projection evidence.

Graph success followed by local outcome-write failure is uncertain/incomplete.
Graph timeout/lost acknowledgement is uncertain, even if an external read
later appears successful. Do not automatically call Graph again: unless a
provider-supported idempotency key and documented semantics are independently
verified, replay can create duplicate invitations. A locally recorded Graph
success proves only that the observation was persisted; it does not itself
commit a security operation, append StaffEvents, or authorize access.

## 7. Evidence states and permitted next actions

“Permitted next action” below is limited to non-mutating diagnosis or
explicitly controlled manual review. It never permits authorization,
automatic replay, retry, repair, or compensation.

| Observed condition | Classification | Permitted next action |
| --- | --- | --- |
| Not started; no durable intent/receipt | Missing / incomplete | Validate request and source availability; do not write or retry automatically |
| Security receipt committed; StaffEvents absent | Incomplete | Inspect durable operation and event keys; manual reconciliation decision only |
| StaffEvents present; security receipt absent | Incomplete or uncertain | Treat event as non-authorizing; inspect security source; never infer security rejection from absence |
| Projection not yet updated/applied | Pending / incomplete | Read projection checkpoint and exact event application evidence; no independent security conclusion |
| Security operation rejected | Rejected | Preserve rejection and reason; do not append a success event or retry automatically |
| Unknown acknowledgement from either write | Uncertain | Read exact operation/event IDs from trusted sources; if unresolved, manual review; no automatic replay |
| Duplicate/replayed operation or event identity | Contradictory/conflict | Preserve the original record; inspect exact immutable receipt; never create a second effect |
| Current binding released or reassigned | Stale/historical or contradictory | Reject use of old ownership evidence; inspect current head and owner; require a new explicitly reviewed operation |
| Graph succeeded externally; local outcome missing | Incomplete/uncertain | Verify with a trusted source or manual review; do not infer local commit or issue another Graph call |
| Source unavailable or records contradict | Unavailable / contradictory | Fail closed; preserve evidence and escalate for manual review |

No state above permits automatic retries. An unknown acknowledgement is not
equivalent to a failed write. A missing receipt is not proof that a transaction
did not commit.

## 8. Independently verified reads

A read is independently verified only when a repository obtains the record
from its named durable source using the expected table/partition/row identity,
validates its schema and ETag/revision relationships, and compares its
contents against the stable operation context. A request payload, caller
assertion, cached projection, successful API response, or contract fixture is
not an independent read.

Even independently read records from multiple stores do not form an atomic
snapshot. Report the source and observed revision for each result, preserve
read errors as unavailable/uncertain, and do not call the correlation
evaluator's internally consistent status an authorization decision.

## 9. Compatibility and migration

Historical security receipts, StaffEvents records, and derived projections
lack complete cross-store operation/event/revision identity. Do not invent
operation IDs, revisions, outcomes, or Graph results during backfill. Retain
their current read/audit behavior, classify them as legacy/un-correlated, and
never use them as proof of a newly coordinated transition.

Before a migration, inventory all writers and readers; define an explicit
versioned schema and reader compatibility period; validate collisions and
binding ownership; and create only factual migration metadata that can be
independently verified. Any reconstructed relationship must remain labeled
inferred/legacy, not durable operation evidence. Migration must be separately
reviewed and staged with rollback procedures; this design authorizes no
backfill or live data change.

## 10. Phased rollout and gates

1. **Contract and review:** settle identifier, receipt, event, projection,
   binding, and invitation schemas; prove partition strategy and duplicate
   handling with isolated tests. All behavior remains default-off.
2. **Synthetic persistence prototype:** test single-partition atomicity,
   stale ETag rollback, duplicate receipts, concurrent owners, and lost
   acknowledgements using isolated Azure Table emulation only. No production
   credentials or staff data.
3. **Read-only shadow observation:** add separately reviewed readers and
   compare only independently sourced records. No writer participation,
   repair, authorization, or retries.
4. **Writer participation proposal:** enumerate every staff writer and prove
   legacy bypass prevention, partial-write handling, projection application,
   and invitation idempotency. Require independent security and operational
   review before any controlled rollout.
5. **Enforcement review:** separately prove commit-time ownership/revision
   predicates, session/credential revocation ordering, uncertain-outcome
   handling, and external executor fencing. Only a later approved milestone
   may consider changing the fail-closed readiness gate.

No phase is enabled by this document. Feature flags, if ever proposed, do not
substitute for storage-enforced participation.

## 11. Non-goals and readiness

This design does not change production writers, repositories, Azure tables,
partition keys, Graph integration, OAuth gates, or ministry records. It does
not create an atomic transaction spanning security receipts, StaffEvents,
projection state, and Graph. Azure Table transactions provide no
cross-table/cross-partition atomicity, and Graph is outside that transaction
model. No production storage topology has been approved.

The OAuth fence remains fail-closed:

- `storageProtocolReady: false`
- `executionPermitted: false`
- `retryPermitted: false`

No operation-correlation or persistence evidence described here grants
production staff authorization.
