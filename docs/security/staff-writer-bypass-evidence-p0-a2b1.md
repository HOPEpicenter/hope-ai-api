# P0-A2B-1: Legacy Staff Writer Bypass Evidence

## Status

Local development evidence only.

This document and its companion regression test are non-authorizing.
They do not establish production writer fencing, storage atomicity,
credential authorization, or permission to activate OAuth execution.

## Verified repository checkpoint

- Base commit: 8a7f142af3b4a93b8aba70011483a6918dce46a3
- Development branch: test/p0-a2b1-staff-writer-bypass-evidence
- Test: tests/authorization/staffWriterBypassEvidence.test.ts

## Known staff-writing pathways

| Operation | Service | HTTP entry point |
| --- | --- | --- |
| Create identity | src/services/staff/staffCommands.ts | src/functions/postStaffIdentity/index.ts |
| Update identity | src/services/staff/staffCommands.ts | src/functions/patchStaffIdentity/index.ts |
| Create invitation | src/services/staff/createStaffInvitation.ts | src/functions/postStaffInvitation/index.ts |
| Activate invitation | src/services/staff/activateStaffInvitation.ts | src/functions/postStaffInvitationActivation/index.ts |

These are four known operations across three service source files.

## Observed persistence boundary

Each known service operation invokes the canonical staff event
writer through an append interface.

The current StaffEventsRepository.append implementation writes
an event using Azure Table createEntity.

Existing OAuth ordering repositories and staff security prototypes
do not establish a production-wide atomic transaction encompassing
the canonical StaffEvents write and relevant OAuth claims.

## Regression evidence

The focused regression passed locally.

It checks:

1. Presence of the four known staff operations.
2. Corresponding HTTP entry point references.
3. Canonical staff repository references.
4. Expected append-call source patterns.
5. Expected inventory of four append sites.
6. The existing direct createEntity persistence pattern.

## Limitations

The regression inspects source text and the Git HEAD snapshot.
It does not execute production staff workflows.

It does not prove that all possible staff writers are inventoried.
Dynamic dispatch, alternate append patterns, direct storage callers,
maintenance operations, older deployed instances, and future
repository changes require separate investigation.

The source-pattern inventory detects changes to its covered patterns,
not every possible new writer.

A green test must never be interpreted as proof of production
writer-fence enforcement, OAuth atomicity, or safe credential execution.

## Outstanding security requirements

- Establish an authoritative shared commit-time ordering boundary.
- Prevent bypass by all legacy and privileged staff writers.
- Preserve canonical staff projections and audit chronology.
- Resolve global Entra binding ownership and uniqueness.
- Prove session and credential revocation ordering.
- Provide durable evidence for uncertain writes.
- Independently enforce external executor cancellation and fencing.
- Validate concurrent, conflicting, and failure scenarios.

## Safety restrictions

- No production StaffEvents writer migration.
- No Azure configuration or storage mutation.
- No real staff or ministry data mutation.
- No OAuth credential execution or automatic retries.
- No feature flag activation.
- No merge or deployment authorized.

The existing readiness restrictions remain:

- storageProtocolReady: false
- executionPermitted: false
- retryPermitted: false

## Next engineering evidence

Register the regression in CI, verify focused tests and build,
and obtain independent architectural review before proposing
any production writer enforcement work.
