# Staff Writer Participation in OAuth Revocation Ordering

## Status

Design under evaluation. No live implementation is authorized.

PR #1329 demonstrated an isolated same-partition Azure Table
transaction using Azurite. It did not coordinate production
StaffEvents and OAuth receipt repositories.

storageProtocolReady=false
executionPermitted=false
retryPermitted=false

## Current staff write inventory

Four service-level write pathways were identified:

1. createStaffIdentity
2. updateStaffIdentity
3. createStaffInvitation
4. activateStaffInvitation

All ultimately append events using StaffEventsRepository.

Current staff events are written to the StaffEvents table,
with partitionKey=staffId and a timestamp/event ID row key.

Existing OAuth receipt entities are stored separately.
No shared transaction exists between these writes.

## Required authoritative boundary

The proposed production protocol needs one durable,
commit-time ordering authority for each security-sensitive
identity mutation and the relevant OAuth claim state.

A writer may not declare a mutation coordinated merely
because two independent writes returned successfully.

A pre-read of staff status, Entra binding, session state,
or OAuth receipt is not a commit-time guarantee.

Any approved design must establish how canonical staff
state and the ordering state are read and committed.

## Proposed atomic write unit

Evaluate storing these synthetic entities in one Azure
Table partition:

- An ordering head with revision and ETag
- A staff mutation event with immutable attempt identity
- Durable correlation evidence for the attempt

A batch would conditionally update the head and create
the event as one Azure Table transaction.

This must not be connected to production staff commands
until existing canonical readers and audit semantics
have an explicitly validated compatibility or migration
strategy.

## Entra identity binding uniqueness

The current canonical binding lookup occurs before
the staff event append.

That lookup alone cannot guarantee uniqueness against
a concurrent writer.

A per-staff partition does not automatically enforce
global uniqueness of an Entra tenant/object binding.

Evaluate an authoritative binding reservation or index
whose uniqueness predicate participates in the relevant
atomic decision.

No cross-partition transaction should be assumed.

A design must resolve this issue before activation.

## Required participating pathways

Staff creation:
Prevent duplicate or stale Entra binding assignments.

Staff updates:
Distinguish ordinary profile changes from binding
replacements and deactivation.

Staff deactivation:
Prevent subsequent OAuth claims from using stale
staff authorization evidence.

Invitation creation:
Define whether the invitation reserves the binding
and how duplicate creation is prevented.

Invitation activation:
Prevent stale or revoked identities from becoming
active through an independent event append.

## Required negative tests

- Two staff records compete for one Entra binding
- Deactivation races with an OAuth claim
- Binding replacement races with a stale session
- Invitation activation races with deactivation
- A stale ordering ETag causes complete rollback
- An event creation conflict causes complete rollback
- A lost acknowledgement follows a committed batch
- A lost acknowledgement follows a failed batch
- Replayed attempt identity cannot create a second event
- An unparticipating legacy writer cannot bypass the gate

## Migration and bypass prevention

Do not replace StaffEventsRepository.append in isolation.

Before migration, identify all readers, writers, audit
consumers and HTTP routes that depend on StaffEvents.

Determine whether an authoritative new event stream,
compatible projection or coordinated migration is needed.

Feature flags alone do not prove writer participation.
The design must prevent legacy writes from bypassing
the ordering authority when enforcement begins.

Do not treat a successful synthetic Azurite transaction
as approval for production writer integration.

## External OAuth execution

The atomic staff event boundary is only one requirement.

Session revocation, credential mutation, execution fencing
and uncertain-outcome recovery remain independent blockers.

No result from this design permits OAuth credential
execution, automatic retries or unsafe reconciliation.

## Safety restrictions

- No real ministry or staff data mutation
- No changes to Azure settings
- No OAuth execution activation
- No production staff repository changes in this design step
- No production storage migration
- No automatic retry enablement
- Preserve existing staff authorization and audit behavior

## Next engineering evidence

1. Select and review a viable partition and binding-index
   strategy before implementing it.
2. Build an isolated SDK-backed multi-writer transaction
   prototype using synthetic records.
3. Test conflict, rollback, uniqueness, reconciliation
   and legacy-bypass scenarios.
4. Require independent CI and architectural review.
5. Keep production fail-closed until integration and
   external executor guarantees are proven.
