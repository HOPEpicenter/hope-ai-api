# Phase C Entra staff acceptance handoff v1

This is a backend-only, default-disabled, offline-testable authorization
handoff foundation for the Phase C staff-binding acceptance operation. It does
not add a route, query staff storage, retrieve credentials, mutate Azure, start
a VM, deploy, or run acceptance.

## Trust boundary

`createEntraStaffAcceptanceHandoff` receives its authorization boundary through
server-side composition. The boundary takes no request values and must return
evidence only after Entra identity verification, canonical Staff resolution,
and administrator authorization. Its evidence must bind the verified staff,
tenant, and object identity to the matching canonical Staff binding, confirm
active status, and represent authorization under configured administrator
policy. Reuse the existing
[`authorizeAuthenticatedStaffAction`](../../src/services/authorization/authorizeAuthenticatedStaffAction.ts)
and
[`resolveVerifiedEntraStaffIdentity`](../../src/services/authorization/resolveVerifiedEntraStaffIdentity.ts)
security path when a future server-side integration supplies this boundary.
Caller-supplied IDs alone are not evidence.

This phase intentionally does not assemble or invoke that live boundary. The
contract's default is disabled; its `enabled` option is trusted server
configuration only and must never be populated from request data. The tests
provide synthetic evidence. No production handler or feature flag enables it.

## One-time semantics

Only `phase-c.staff-binding.acceptance` can be issued or consumed. Evidence
must be current (no more than five minutes old), active, administrator
authorized, and internally identity-consistent at both issuance and
consumption. Consumption re-resolves authorization through the trusted
boundary, so inactive Staff, lost administrator authority, stale evidence,
and mismatched verified identity are denied.

The durable repository uses Azure Table Storage's create-only unique row key
for issuance, then reads the record and uses a single ETag-conditional
`Replace` to transition revision 0 from `issued` to `consumed`. Only one
competing consumer can win across repository instances. Missing, malformed,
stale-revision, replayed, expired, conflicting, or uncertain storage state
fails closed; write retries are not performed. The repository receives an
already-created Table port and does not provision tables or read storage
configuration.

The returned receipt contains only an opaque random value. Durable state binds
that value to the fixed operation, expiration, and a per-receipt SHA-256
identity digest; it does not persist raw Staff, tenant, or object IDs. The
digest is not encryption and storage access remains sensitive.

Azure Table ETags provide conditional concurrency, not a server-side expiry
predicate. The repository checks its trusted clock before the conditional
write and after acknowledgement; if expiry occurs during the write it denies
authorization even though the receipt may have been consumed. An ambiguous
storage acknowledgement is reported as unavailable and never treated as
success. This handoff still does not execute or attest the acceptance
operation, and it does not authorize live acceptance.

## Remaining security boundary

The trusted server-side boundary must perform fresh token verification,
canonical Staff resolution, current active-status validation, and configured
administrator authorization for every issue and consume. Durable records do
not subscribe to Staff revocation events or maintain a revocation generation;
revocation is enforced by that fresh boundary check at consumption. There is
no production wiring in this phase. A future live acceptance design would
require separate security review, production trust-boundary wiring, and
explicit enablement; this foundation alone is not approval to run acceptance.

## Isolated Staff-revocation atomicity proof

The E125 proof adds an offline-only transaction over synthetic rows in one
`StaffEvents` Staff partition. It treats the head's `authorizationRevision`
and `state` as explicit proof fields, binds a receipt to the fixed acceptance
operation, an opaque verified-identity digest, and the revision at issuance,
then conditionally updates both the head and receipt using their ETags in one
Table transaction. The competing deactivation transaction updates that same
head and appends the canonical lifecycle event atomically. A shared original
head ETag permits only one competing transaction to commit; the loser is
denied, and a committed receipt consumption is ordered before any subsequent
revocation.

This is **not authoritative live authorization**. Production lifecycle
writers are not migrated or fenced, the proof has no live trust-boundary
composition, and neither a receipt result nor an advanced authorization
revision authorizes execution. The authorization digest must be computed from
fresh server-verified Staff/tenant/object evidence; raw identifiers are not
stored in the proof receipt. The proof is default-disabled, test-only, and
uses synthetic data with local Azurite.

A future execution fence must cover the gap between receipt consumption and
actual acceptance execution, ordering revocation against the operation at its
real execution boundary. Until that separate fence and production writer
participation are implemented and reviewed, Phase C live acceptance remains
blocked.

## Strict Staff security-head protocol proof

The isolated E134 prototypes require a security head with a nonnegative,
incrementable `revision`, an equal `authorizationRevision`, an explicit
`active`, `pending`, or `revoked` state, the expected Staff partition and
reserved row key, and a non-wildcard ETag. Missing, malformed, mismatched, or
stale head state is denied. Coordinated mutation and deactivation always
advance both revisions together; pending heads can transition to active only
through the activation event path, while deactivation changes active to
revoked.

Revoked-to-active reactivation is a separate default-disabled transaction. It
requires an injected trusted server-side authorization boundary to approve the
exact Staff, activation event, actor, and observed authorization revision.
That approval is followed by one ETag-conditional transaction that advances
the head and creates the canonical activation event and operation receipt.
Authorization failures, ETag conflicts, and ambiguous acknowledgements never
produce an authorized result.

These are storage protocol proofs only. They are not wired to production
Staff writers, do not initialize or migrate existing Staff heads, and do not
make the security head authoritative. The default production writer behavior
is unchanged. Pending or revoked heads cannot consume acceptance receipts;
the separate E125 receipt proof still returns no execution permission. Safe
head migration, complete legacy-writer fencing, authoritative administrator
authorization, and the execution fence remain unresolved before any live
acceptance could be considered.

## Output and verification

Results contain only generic status values and an opaque receipt value. The
implementation and synthetic tests do not log or return identity values,
credentials, tokens, or staff records. The Azurite regression uses only local
emulator storage and synthetic evidence. The approved
[`phase-c-staff-binding-acceptance.py`](../../scripts/phase-c-staff-binding-acceptance.py)
runner remains unchanged; do not run it as part of this offline contract.
