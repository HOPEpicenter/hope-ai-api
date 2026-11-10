/**
 * Non-authorizing Staff writer transition policy.
 *
 * This classifies whether a legacy append is locally eligible
 * under a transition policy. It does NOT authorize a Staff
 * mutation, verify a caller, or prove production fencing.
 *
 * No storage, network, Graph, OAuth, or execution side effects.
 */

export type StaffWriterMutationCategory =
  | "identity_creation"
  | "identity_update"
  | "identity_deactivation"
  | "invitation_activation";

export type StaffWriterTransitionMode =
  | "legacy"
  | "migration_hold"
  | "coordinated";

export type StaffWriterTransitionInput = Readonly<{
  category: unknown;
  mode?: unknown;
  productionWriterFenced?: unknown;
}>;

export type StaffWriterTransitionDecision = Readonly<{
  status: "legacy_candidate" | "blocked" | "invalid";
  reason:
    | "legacy_mode"
    | "migration_hold"
    | "coordinator_required"
    | "invalid_policy";
  legacyAppendEligible: boolean;
  authorizationGranted: false;
  coordinatedExecutionPermitted: false;
  retryPermitted: false;
  recoveryPermitted: false;
  reservationReleasePermitted: false;
  productionWriterFenced: false;
}>;

const CATEGORIES = new Set<string>([
  "identity_creation",
  "identity_update",
  "identity_deactivation",
  "invitation_activation"
]);

function decision(
  status: StaffWriterTransitionDecision["status"],
  reason: StaffWriterTransitionDecision["reason"],
  eligible: boolean
): StaffWriterTransitionDecision {
  return {
    status,
    reason,
    legacyAppendEligible: eligible,
    authorizationGranted: false,
    coordinatedExecutionPermitted: false,
    retryPermitted: false,
    recoveryPermitted: false,
    reservationReleasePermitted: false,
    productionWriterFenced: false
  };
}

export function classifyStaffWriterTransition(
  input: unknown
): StaffWriterTransitionDecision {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return decision("invalid", "invalid_policy", false);
  }

  const value = input as Record<string, unknown>;

  if (
    typeof value.category !== "string" ||
    !CATEGORIES.has(value.category)
  ) {
    return decision("invalid", "invalid_policy", false);
  }

  // Never accept an asserted production fence as proof.
  if (
    value.productionWriterFenced !== undefined &&
    value.productionWriterFenced !== false
  ) {
    return decision("invalid", "invalid_policy", false);
  }

  // Undefined is the unchanged legacy compatibility state.
  // A null, unknown, or malformed explicit mode fails closed.
  const mode =
    value.mode === undefined ? "legacy" : value.mode;

  if (mode === "legacy") {
    return decision("legacy_candidate", "legacy_mode", true);
  }

  if (mode === "migration_hold") {
    return decision("blocked", "migration_hold", false);
  }

  if (mode === "coordinated") {
    // Coordinated operations require a separate, proven writer.
    // This policy never executes or authorizes one.
    return decision("blocked", "coordinator_required", false);
  }

  return decision("invalid", "invalid_policy", false);
}