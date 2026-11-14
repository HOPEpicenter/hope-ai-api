# Phase C — Trusted Operation Authority Design

Status: Proposed; not approved for activation.

## Security boundary

GitHub approval history, job evidence, durable reservations,
staff administrator status, and environment flags are supporting
data. None independently authorizes Azure execution.

## Required independent issuer

A protected workload must independently authenticate its identity,
validate current operation-specific approval policy, and issue a
short-lived RS256 credential using a protected signing key.

Issuer trust must be established through infrastructure-controlled
configuration, not caller-supplied keys or token metadata.

## Required operation binding

The credential must bind:
- Exact operation ID and request ID
- Exact Azure resource scope and approved runbook
- Trusted issuer and audience
- Expiration and unique credential ID
- Independently validated approval provenance
- One-time-use requirement

## Consumption

The protected consumer must:
1. Verify the signature using its pinned trust configuration.
2. Verify all operation bindings and expiration.
3. Atomically claim one-time credential use.
4. Reject conflicts, duplicates, and uncertain outcomes.
5. Never retry an uncertain Azure operation blindly.

## Activation boundary

The existing authority verifier must remain disconnected until
the independent issuer, approval policy, protected deployment
identity, and operation gate are separately implemented and tested.

No production or staging activation is approved by this document.

## Non-goals

- No live Azure job creation
- No Azure permission changes
- No signing-key generation or storage
- No automated visitor contact
- No staff identity changes
- No protected execution feature activation
