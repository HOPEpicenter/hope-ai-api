/**
 * E149A: Inert, synthetic-only contract for a future Staff security authority.
 *
 * NOT a storage adapter. Does not read environment flags, Azure Tables,
 * canonical StaffEvents, or live Staff identities. It cannot authorize
 * Staff mutation, migration, retries, Graph invitations, or OAuth execution.
 *
 * A reviewed future implementation must provide independently proven global
 * binding ownership and writer isolation before any authority can be granted.
 */
export type StaffAuthorityOperation =
  | "binding_acquire"
  | "binding_transfer"
  | "staff_create"
  | "staff_update"
  | "staff_deactivate"
  | "invitation_reserve"
  | "invitation_activate"
  | "oauth_claim";

export type StaffAuthorityHeadEvidence = Readonly<{
  staffId: string;
  expectedRevision: number;
  expectedGeneration: number;
  expectedState: "pending" | "active" | "revoked";
  operationId: string;
}>;

/**
 * A future port may inspect an isolated authority head, but this version
 * explicitly denies every proposal regardless of its claimed evidence.
 * Supplying a head, even with a fresh ETag, cannot grant permission.
 */
export type StaffAuthorityProposal = Readonly<{
  operation: StaffAuthorityOperation;
  head: StaffAuthorityHeadEvidence;
}>;

export type StaffAuthorityDecision = Readonly<{
  status: "disabled";
  reason: "authority_adapter_not_implemented";
  authoritative: false;
  migrationPermitted: false;
  writePermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  recoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

export function assessDisabledStaffAuthorityProposal(
  _proposal: unknown
): StaffAuthorityDecision {
  return {
    status: "disabled",
    reason: "authority_adapter_not_implemented",
    authoritative: false,
    migrationPermitted: false,
    writePermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    recoveryPermitted: false,
    productionRolloutPermitted: false
  };
}
