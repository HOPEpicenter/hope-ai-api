# OAuth Coordination Integration Readiness

## Current status

**Not ready for credential execution.**

This document records source-inspection findings, not
evidence that production OAuth mutations participate in
a shared atomic coordination protocol.

The authoritative execution-fence readiness gate remains
`storageProtocolReady: false` and `executionPermitted: false`.

The participation inventory is non-authorizing metadata.
It must never be accepted as a capability token or used
to turn on a feature flag.

## Reviewed source paths

- `src/services/staff/staffCommands.ts`
- `src/functions/patchStaffIdentity/index.ts`
- `src/services/authorization/authorizeOAuthCredentialOperation.ts`
- `src/services/authorization/inspectOAuthExecutionBoundaryReadiness.ts`
- `src/services/authorization/inspectOAuthFenceStorageReadiness.ts`
- `src/services/authorization/modelOAuthRevocationOrdering.ts`
- `src/services/authorization/modelOAuthOrderingTransitionReceipts.ts`
- `src/repositories/oauthOrderingReceiptStorageRepository.ts`
- `src/repositories/readOAuthOrderingReceiptReconciliation.ts`

## Source-grounded findings

| Workflow | Inspected behavior | Outstanding evidence |
| --- | --- | --- |
| Staff deactivation | `updateStaffIdentity` appends `staff.deactivated` through `StaffEventsRepository` | Shared atomic ordering with dependent OAuth operations |
| Entra binding changes | Staff identity updates accept Entra binding fields | Atomic invalidation of stale identity associations |
| Session revocation | Named revocation writer not located in the audit | Authoritative revocation writer and participation proof |
| Credential revocation | Named revocation writer not located in the audit | Atomic mutation ordering, failure recovery, and executor enforcement |
| Credential rotation | Named rotation writer not located in the audit | Atomic mutation ordering, failure recovery, and executor enforcement |

The negative writer searches are limited to inspected
names and patterns. They are not proof that no equivalent
implementation exists elsewhere.

## Existing foundation

The V2 receipt repository demonstrates conditional
single-entity replacement with preserved transition
history in synthetic tests and an Azurite integration.

The V2 read-only reconciler inspects exact attempt
receipts in that validated history.

These proofs do **not** establish one atomic ordering
point shared with Staff Events, sessions, credentials
or any external OAuth executor.

## Required before execution enablement

1. Identify the authoritative write owner for every
   relevant identity, session and credential mutation.
2. Establish a common atomic ordering point and
   commit-time predicates for all participating paths.
3. Prove that stale reads cannot authorize execution
   after revocation commits.
4. Preserve attempt evidence for uncertain writes,
   without automatic retries or unsafe inference.
5. Define cancellation and fencing behavior that
   the external executor independently enforces.
6. Test concurrency, lost acknowledgements, invalid
   receipts, writer failures and superseding revocations.
7. Complete controlled acceptance before any explicit
   decision to enable production credential execution.

## Scope exclusions for this PR

- No modifications to staff administration.
- No mutation of real staff identities or ministry data.
- No Azure storage provisioning or configuration change.
- No OAuth session issuance or credential execution.
- No implicit conversion of V2 receipts into authorization.
- No change to the existing execution-fence readiness gate.
- No deployment-time feature activation.

## Safety rule

A green CI result for this inventory proves only that
the declared blockers remain represented and the
inventory remains fail-closed. It does not prove that
the blockers have been resolved.
