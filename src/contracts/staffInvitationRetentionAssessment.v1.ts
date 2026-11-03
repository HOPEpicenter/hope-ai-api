import { types } from "node:util";

/**
 * Synthetic C5 retention assessment only.
 * No storage I/O, deletion, scheduling, or policy approval.
 * All input is caller-supplied and untrusted.
 */
export type RetentionStatus =
  | "input_rejected"
  | "policy_unverified"
  | "hold_or_unknown"
  | "not_due"
  | "candidate_due_unverified";

export type RetentionAssessment = Readonly<{
  status: RetentionStatus;
  advisoryOnly: true;
  authoritative: false;
  policyIndependentlyVerified: false;
  deletionPermitted: false;
  storageAccessPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
}>;

const denied = Object.freeze({
  advisoryOnly: true,
  authoritative: false,
  policyIndependentlyVerified: false,
  deletionPermitted: false,
  storageAccessPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const);

const keys = [
  "schemaVersion",
  "createdAt",
  "expiresAt",
  "observedAt",
  "policyApprovedClaim",
  "holdStatus"
] as const;

function outcome(status: RetentionStatus): RetentionAssessment {
  return Object.freeze({ status, ...denied });
}

function readTimestamp(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return null;
  }

  const timestamp = new Date(value);
  const milliseconds = timestamp.getTime();

  return Number.isFinite(milliseconds) &&
    timestamp.toISOString() === value
    ? milliseconds
    : null;
}

export function assessStaffInvitationRetention(
  input: unknown
): RetentionAssessment {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      types.isProxy(input)
    ) {
      return outcome("input_rejected");
    }

    const prototype = Object.getPrototypeOf(input);

    if (prototype !== Object.prototype && prototype !== null) {
      return outcome("input_rejected");
    }

    const actualKeys = Reflect.ownKeys(input);

    if (
      actualKeys.length !== keys.length ||
      actualKeys.some(
        key => typeof key !== "string" ||
          !keys.includes(key as typeof keys[number])
      )
    ) {
      return outcome("input_rejected");
    }

    const descriptors = Object.getOwnPropertyDescriptors(input);
    const values: Record<string, unknown> = Object.create(null);

    for (const key of keys) {
      const descriptor = descriptors[key];

      if (
        !descriptor ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return outcome("input_rejected");
      }

      values[key] = descriptor.value;
    }

    const created = readTimestamp(values.createdAt);
    const expires = readTimestamp(values.expiresAt);
    const observed = readTimestamp(values.observedAt);

    if (
      values.schemaVersion !== 1 ||
      created === null ||
      expires === null ||
      observed === null ||
      expires <= created ||
      observed < created ||
      typeof values.policyApprovedClaim !== "boolean" ||
      !["none", "active", "unknown"].includes(
        values.holdStatus as string
      )
    ) {
      return outcome("input_rejected");
    }

    if (values.holdStatus !== "none") {
      return outcome("hold_or_unknown");
    }

    if (values.policyApprovedClaim !== true) {
      return outcome("policy_unverified");
    }

    if (observed < expires) {
      return outcome("not_due");
    }

    // Even complete caller claims cannot authorize deletion.
    return outcome("candidate_due_unverified");
  } catch {
    return outcome("input_rejected");
  }
}
