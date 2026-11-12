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
contract's default is disabled; the tests provide synthetic in-memory evidence.
Do not enable it from request data or wire it to a production handler as part of
this phase.

## One-time semantics

Only `phase-c.staff-binding.acceptance` can be issued or consumed. Evidence
must be current (no more than five minutes old), active, administrator
authorized, and internally identity-consistent at both issuance and
consumption. Consumption removes the in-memory receipt before checking the
operation or awaiting the boundary, so failures and concurrent attempts do
not permit replay. A receipt is an empty object capability held in a
`WeakMap`; it contains no identity, credential, or token and is unusable by
serialization or another handoff instance.

The handoff is process-local and non-durable. It does not establish durable
replay protection across restarts or instances and does not execute or attest
the acceptance operation. This in-memory receipt therefore does not authorize
live acceptance. Any future production use requires a separately reviewed
durable atomic-consumption design and explicit enablement.

## Output and verification

Results contain only generic status values. The implementation and synthetic
tests do not log or return identity values, credentials, tokens, or staff
records. The approved
[`phase-c-staff-binding-acceptance.py`](../../scripts/phase-c-staff-binding-acceptance.py)
runner remains unchanged; do not run it as part of this offline contract.
