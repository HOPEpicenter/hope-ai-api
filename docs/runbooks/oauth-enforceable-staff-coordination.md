# Enforceable Staff and OAuth Coordination Architecture

## Status

Candidate architecture evaluation only.

No production writer migration, OAuth execution,
credential access or Azure configuration change
is authorized by this document.

storageProtocolReady=false
executionPermitted=false
retryPermitted=false

## Verified repository baseline

StaffEventsRepository.append writes directly to the
StaffEvents Azure Table using createEntity.

PartitionKey is staffId. Canonical identity readers
project events from StaffEventsRepository.listAll.

OAuth ordering receipts remain in a separate store.

The existing isolated Azurite proofs do not establish
coordination across those production storage boundaries.

## Staff writer inventory

- createStaffIdentity
- updateStaffIdentity
- createStaffInvitation
- activateStaffInvitation

All relevant writers must be addressed before any
enforcement rollout.

Profile-only updates also require an explicit policy;
a legacy uncoordinated append cannot be presumed safe.

## Canonical reader compatibility

Canonical staff identity is used in administration,
pastoral authorization, care ownership, communications,
ministry areas, formation and six-week follow-up.

The migration must preserve stable staff IDs,
event chronology, role semantics, audit history,
binding lookup and staff status derivation.

readMutationActorStaffIdentity has a compatibility
fallback through STAFF_IDENTITY_REGISTRY.

That fallback must not become evidence of OAuth
revocation-fence participation.

Do not remove or change it in this research PR.

## Option A: Shared security partition

Evaluate a common Azure Table partition containing:

- Conditional ordering head
- Immutable staff transition evidence
- Binding ownership reservation
- Immutable attempt identity and reconciliation evidence
- Claim and revocation ordering state

Potential benefit:
One transaction can atomically update multiple entities
provided all entities are in the same Table partition.

Risks:
A shared partition may become a serialization hotspot.
Batch size and transaction limits apply.
Historical migration and compatibility are unresolved.
The storage authority must have enforced writer access
and no legacy bypass path.

A global partition is a candidate, not an approval.

## Option B: Per-staff partitions

Evaluate an ordering head and staff events per staffId.

Potential benefit:
Independent staff mutations can be partition-isolated.

Blocking issue:
Entra binding ownership is unique across staff IDs.
A reservation in another partition cannot be
atomically updated with a per-staff transition.

Do not claim global uniqueness without a proven
single commit-time authority.

## Binding ownership requirements

Uniqueness must be based on normalized Entra tenant
and object identity, not a pre-read directory scan.

A replacement must account for both previous and new
binding ownership, including conflicting writers.

The protocol must address creation, invitation,
activation, replacement, deactivation and replay.

No cross-partition atomicity should be assumed.

## Revocation and claim ordering

A committed revocation must reject stale claims.

A claim committed first must be represented durably
when revocation becomes pending.

Pending revocation must prevent new claims.

External execution still requires separately verified
cancellation and fence enforcement.

A storage receipt is not permission to execute OAuth.

## Legacy writer bypass prevention

The current StaffEventsRepository.append is a direct
uncoordinated append and remains a production blocker.

Evaluate how to prevent any legacy writer from
committing security-sensitive staff transitions
outside the authoritative ordering protocol.

A feature flag, wrapper convention or application
pre-read alone is not sufficient enforcement.

The eventual plan must cover deployed older instances,
worker versions, direct repository callers and
privileged maintenance writes.

No production writer change is authorized yet.

## External invitation side effects

createStaffInvitation invokes an external invitation
sender before appending the staff.invited event.

External Microsoft Graph actions cannot join an
Azure Table transaction.

A future approach must separately address
idempotency, compensation, failed persistence,
duplicate invitations and uncertain outcomes.

Do not execute invitations in synthetic tests.

## Migration and rollback requirements

Before changing live writers:

1. Inventory all historical StaffEvents and readers.
2. Specify authoritative storage ownership.
3. Define how old events are projected consistently.
4. Prevent writes through legacy paths.
5. Test concurrent old and new writer behavior.
6. Plan reconciliation of ambiguous commits.
7. Define rollback without losing revocation evidence.
8. Verify all security-related readers and audits.

No destructive migration is authorized.

## Research validation requirements

- Competing normalized binding assignments
- Stale deactivation and OAuth claim collisions
- Claim-first pending revocation
- Invitation activation versus deactivation
- Legacy bypass attempts
- Event replay and immutable attempt identity
- Ambiguous acknowledgements, commit and rejection
- Historical projection parity
- Failure of storage coordination
- Cross-partition limitation demonstrations
- No execution or retry permission on any outcome

## Required decision before implementation

Choose an authoritative transaction topology that
enforces both binding uniqueness and OAuth ordering.

Prove how every relevant writer is forced to
participate and how canonical staff readers remain
compatible.

Until then, all production execution gates stay
disabled and the current staff repositories unchanged.
