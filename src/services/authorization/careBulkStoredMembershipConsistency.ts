import {
  assessCareBulkOperationIdentity
} from "./careBulkOperationIdentityBoundary";
import {
  parseCareBulkMembershipIntent
} from "./careBulkRequestMembershipContract";
import type {
  CareBulkMembershipStorageRepository,
  CareBulkStoredMembershipComparison
} from "../../repositories/careBulkMembershipStorageRepository";

/**
 * Advisory-only operation identity versus stored membership comparison.
 *
 * Caller identity and membership are captured before the asynchronous
 * read. Storage comparison is not evidence of writer participation,
 * assignment execution, historical completeness or safe replay.
 *
 * This service does not create storage records or invoke live writers.
 */
export type CareBulkStoredMembershipConsistencyStatus =
  | "matching_stored_evidence_unverified"
  | "identity_mismatch"
  | "missing_operation_identity"
  | "stored_membership_conflict"
  | "storage_uncertain"
  | "invalid_input";

export type CareBulkStoredMembershipConsistencyResult = Readonly<{
  status: CareBulkStoredMembershipConsistencyStatus;
  advisoryOnly: true;
  durableIdentityVerified: false;
  durableMembershipVerified: false;
  writerParticipationVerified: false;
  assignmentExecutionVerified: false;
  historicalCompletenessVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

type MembershipReader = Pick<
  CareBulkMembershipStorageRepository,
  "compareStoredIntent"
>;

const safety = Object.freeze({
  advisoryOnly: true,
  durableIdentityVerified: false,
  durableMembershipVerified: false,
  writerParticipationVerified: false,
  assignmentExecutionVerified: false,
  historicalCompletenessVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const);

function outcome(
  status: CareBulkStoredMembershipConsistencyStatus
): CareBulkStoredMembershipConsistencyResult {
  return Object.freeze({ status, ...safety });
}

export async function assessCareBulkStoredMembershipConsistency(
  operationIdentityInput: unknown,
  membershipInput: unknown,
  reader: MembershipReader
): Promise<CareBulkStoredMembershipConsistencyResult> {
  try {
    const identity = assessCareBulkOperationIdentity(
      operationIdentityInput
    );
    const membership = parseCareBulkMembershipIntent(
      membershipInput
    );

    if (identity.status === "invalid_input" ||
        !membership.intent) {
      return outcome("invalid_input");
    }

    if (identity.operationId === null) {
      return outcome("missing_operation_identity");
    }

    // Never consult storage for mismatched caller operation identity.
    if (identity.operationId !== membership.intent.requestId) {
      return outcome("identity_mismatch");
    }

    // The parser produced a detached, immutable membership snapshot.
    // Caller mutation during the await cannot change its contents.
    const snapshot = membership.intent;
    const stored: CareBulkStoredMembershipComparison =
      await reader.compareStoredIntent(snapshot);

    // Accept only an exact, self-consistent repository result.
    // Capture each own data property once; accessors and hostile
    // proxies are never evidence of a successful storage match.
    const expectedKeys = [
      "status",
      "durableMembershipVerified",
      "authorizationPermitted",
      "executionPermitted",
      "retryPermitted",
      "automaticRecoveryPermitted",
      "productionRolloutPermitted"
    ];

    if (stored === null || typeof stored !== "object" ||
        Array.isArray(stored)) {
      return outcome("storage_uncertain");
    }

    const actualKeys = Reflect.ownKeys(stored);
    if (actualKeys.length !== expectedKeys.length ||
        !expectedKeys.every(key => actualKeys.includes(key))) {
      return outcome("storage_uncertain");
    }

    const values = new Map<string, unknown>();
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(stored, key);
      if (!descriptor ||
          !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return outcome("storage_uncertain");
      }
      values.set(key, descriptor.value);
    }

    for (const key of expectedKeys.slice(1)) {
      if (values.get(key) !== false) {
        return outcome("storage_uncertain");
      }
    }

    switch (values.get("status")) {
      case "matching_evidence":
        return outcome("matching_stored_evidence_unverified");
      case "conflict":
        return outcome("stored_membership_conflict");
      case "invalid_input":
        return outcome("invalid_input");
      case "uncertain":
        return outcome("storage_uncertain");
      default:
        return outcome("storage_uncertain");
    }
  } catch {
    // Transport errors, malformed readers and unexpected exceptions
    // must never grant permission or imply durable proof.
    return outcome("storage_uncertain");
  }
}
