/**
 * OAuth execution-fence storage participation gate.
 *
 * This module records unimplemented security invariants.
 * It is NOT a storage adapter, authorization grant, lease,
 * lock, fence acquisition API, or execution capability.
 *
 * Never accept caller-supplied "proof" to turn this gate on.
 * Future implementations require repository-backed evidence,
 * participating revocation writes, and concurrency validation.
 */

export const OAUTH_FENCE_STORAGE_BLOCKERS = [
  "staff_deactivation_not_coordinated",
  "entra_binding_changes_not_coordinated",
  "session_revocation_not_coordinated",
  "credential_mutations_not_coordinated",
  "atomic_ordering_not_demonstrated",
  "uncertain_commit_recovery_not_demonstrated",
  "external_execution_cancellation_not_demonstrated"
] as const;

export type OAuthFenceStorageBlocker =
  typeof OAUTH_FENCE_STORAGE_BLOCKERS[number];

export type OAuthFenceStorageReadiness = Readonly<{
  storageProtocolReady: false;
  executionPermitted: false;
  requiresAtomicCoordination: true;
  blockers: readonly OAuthFenceStorageBlocker[];
}>;

/**
 * Fail-closed inspection of currently established guarantees.
 *
 * No flags, inputs or repository snapshots can turn the result
 * into an execution permit. A future implementation must prove:
 *
 * 1. A single atomic ordering point shared by all applicable
 *    staff, session and credential revocation pathways.
 * 2. Commit-time predicates, rather than pre-read snapshots.
 * 3. Fail-closed handling of lost or ambiguous acknowledgements.
 * 4. Recovery that never mistakes expiry for cancellation.
 * 5. An external executor that independently enforces the fence.
 *
 * Successful Azure Table ETag updates on unrelated partitions
 * cannot satisfy these requirements.
 */
export function inspectOAuthFenceStorageReadiness():
  OAuthFenceStorageReadiness {
  return {
    storageProtocolReady: false,
    executionPermitted: false,
    requiresAtomicCoordination: true,
    blockers: [...OAUTH_FENCE_STORAGE_BLOCKERS]
  };
}
