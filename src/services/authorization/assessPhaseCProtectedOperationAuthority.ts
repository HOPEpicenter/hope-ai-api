/**
 * Phase C protected operation authority contract.
 *
 * Preparation only. No trusted issuer is connected.
 * Caller-supplied evidence, administrator identity, reservations,
 * environment flags and approval records cannot authorize execution.
 */

export type PhaseCProtectedOperationScope = Readonly<{
  operationId: string;
  resourceScope: string;
  runbookName: string;
  requestId: string;
  expiresUtc: number;
  approvalProvenance: string;
  oneTimeUse: true;
}>;

export type PhaseCProtectedAuthorityDecision = Readonly<{
  status: "TRUSTED_OPERATION_AUTHORITY_NOT_CONNECTED";
  executionAuthorized: false;
  retryAuthorized: false;
}>;

export function assessPhaseCProtectedOperationAuthority(
  _scope?: unknown,
  _evidence?: unknown,
  _executionRequested: unknown = false
): PhaseCProtectedAuthorityDecision {
  return {
    status: "TRUSTED_OPERATION_AUTHORITY_NOT_CONNECTED",
    executionAuthorized: false,
    retryAuthorized: false
  };
}

export function phaseCProtectedAuthorityVerifierAvailable(): false {
  return false;
}
