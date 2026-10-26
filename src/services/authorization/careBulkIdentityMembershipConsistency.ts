import {
  assessCareBulkOperationIdentity
} from "./careBulkOperationIdentityBoundary";
import {
  parseCareBulkMembershipIntent
} from "./careBulkRequestMembershipContract";

/**
 * Advisory-only comparison of two independently parsed caller intents.
 *
 * Matching operationId and membership requestId does not prove storage
 * persistence, idempotency, authorization, execution, or replay safety.
 *
 * No production handlers, Azure I/O, retries, or recovery.
 */
export type CareBulkIdentityMembershipConsistency = Readonly<{
  status:
    | "consistent_unverified_intent"
    | "identity_mismatch"
    | "missing_operation_identity"
    | "invalid_input";
  durableIdentityVerified: false;
  durableMembershipVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const safety = {
  durableIdentityVerified: false,
  durableMembershipVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

function result(
  status: CareBulkIdentityMembershipConsistency["status"]
): CareBulkIdentityMembershipConsistency {
  return Object.freeze({ status, ...safety });
}

export function assessCareBulkIdentityMembershipConsistency(
  operationIdentityInput: unknown,
  membershipInput: unknown
): CareBulkIdentityMembershipConsistency {
  try {
    const identity = assessCareBulkOperationIdentity(
      operationIdentityInput
    );

    const membership = parseCareBulkMembershipIntent(
      membershipInput
    );

    if (identity.status === "invalid_input" ||
        membership.status === "invalid_input" ||
        !membership.intent) {
      return result("invalid_input");
    }

    if (identity.status === "missing_operation_identity" ||
        identity.operationId === null) {
      return result("missing_operation_identity");
    }

    return result(
      identity.operationId === membership.intent.requestId
        ? "consistent_unverified_intent"
        : "identity_mismatch"
    );
  } catch {
    // Unexpected behavior from hostile inputs must fail closed.
    return result("invalid_input");
  }
}
