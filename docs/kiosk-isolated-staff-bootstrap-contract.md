# Isolated Kiosk Staff Bootstrap — Safety Contract

Status: DESIGN ONLY — EXECUTION DISABLED

## Purpose

Establish one authorized canonical Staff identity binding for
the existing HOPE owner in the isolated Friends & Family kiosk.

This document does not authorize a Staff mutation.

## Isolation

- Target only the exact isolated kiosk acceptance backend.
- Deny production, original staging, and unknown environments.
- Do not create a public bootstrap HTTP endpoint.
- Do not copy production Staff records or credentials.
- Do not activate kiosk pairing or visitor intake.

## Authorization

- Default-deny without independent owner execution approval.
- Verify the intended tenant and owner identity.
- Verify an explicit, narrowly scoped bootstrap authorization.
- Never treat Azure Contributor or API-key possession alone
  as authorization to create a canonical Staff identity.
- Never bypass Staff writer runtime restrictions.

## Canonical Staff integrity

- Use the existing canonical Staff event contract.
- Preserve a verifiable bootstrap actor and operation ID.
- Do not invent an ordinary active Staff actor.
- Reject inconsistent or pre-existing binding evidence.
- Require a race-safe, retry-safe one-time reservation or
  equivalent atomic creation guarantee.
- Preserve durable audit and reconciliation evidence.
- Never automatically retry an uncertain write.

## Execution boundary

- Local design and tests may be developed separately.
- No live Staff read beyond separately authorized scope.
- No live Staff creation, update, activation, or binding.
- No Azure settings or Entra changes.
- No deployment, PR merge, or feature activation.
- Any real execution requires new explicit owner approval.

## Acceptance requirements

- Default-disabled tests pass.
- Wrong environment and identity are rejected.
- Duplicate, replay, and ambiguous outcomes fail closed.
- Canonical event and audit requirements are verified.
- Explicit execution approval is separately documented.