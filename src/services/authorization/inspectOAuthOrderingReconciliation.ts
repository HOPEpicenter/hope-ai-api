import {
  modelOAuthRevocationOrdering,
  type OAuthOrderingCommand,
  type OAuthOrderingSnapshot
} from "./modelOAuthRevocationOrdering";

/**
 * Synthetic, read-only evidence inspection.
 *
 * This evaluator cannot establish which worker committed
 * a matching transition. A matching snapshot is NOT a
 * durable attempt receipt or permission to execute.
 */
export type OAuthOrderingReconciliationStatus =
  | "consistent_unproven"
  | "not_observed"
  | "superseded"
  | "unresolved";

export interface OAuthOrderingReconciliationResult {
  readonly status: OAuthOrderingReconciliationStatus;
  readonly exactCommitProven: false;
  readonly retryPermitted: false;
  readonly executionPermitted: false;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const STATES = [
  "idle",
  "claimed",
  "revocation_pending",
  "revoked",
  "completed",
  "uncertain"
] as const;

const SOURCES = [
  "staff_deactivation",
  "entra_binding_change",
  "session_revocation",
  "credential_revocation",
  "credential_rotation"
] as const;

function validClaimId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !/[\r\n]/.test(value);
}

function validSnapshot(
  value: unknown
): value is OAuthOrderingSnapshot {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) return false;

  const v = value as Record<string, unknown>;

  if (
    !Number.isSafeInteger(v.revision) ||
    typeof v.revision !== "number" ||
    v.revision < 0 ||
    v.revision >= Number.MAX_SAFE_INTEGER ||
    !STATES.includes(v.state as typeof STATES[number])
  ) {
    return false;
  }

  const sourceValid =
    SOURCES.includes(
      v.revocationSource as typeof SOURCES[number]
    );

  switch (v.state) {
    case "idle":
      return v.claimId === null &&
        v.revocationSource === null;

    case "revoked":
      return v.claimId === null && sourceValid;

    case "claimed":
    case "completed":
      return validClaimId(v.claimId) &&
        v.revocationSource === null;

    case "revocation_pending":
      return validClaimId(v.claimId) && sourceValid;

    case "uncertain":
      return validClaimId(v.claimId) &&
        (v.revocationSource === null || sourceValid);

    default:
      return false;
  }
}

function result(
  status: OAuthOrderingReconciliationStatus
): OAuthOrderingReconciliationResult {
  return Object.freeze({
    status,
    exactCommitProven: false,
    retryPermitted: false,
    executionPermitted: false
  });
}

function sameSnapshot(
  a: OAuthOrderingSnapshot,
  b: OAuthOrderingSnapshot
): boolean {
  return a.revision === b.revision &&
    a.state === b.state &&
    a.claimId === b.claimId &&
    a.revocationSource === b.revocationSource;
}

/**
 * "observed" must come from a trusted read-only source.
 *
 * Supplying caller-controlled snapshots cannot establish
 * storage authenticity. This pure function does not read
 * Azure, access credentials, or mutate any state.
 *
 * A revision equal to the expected next revision is only
 * consistent evidence, never exact-attempt proof.
 */
export function inspectOAuthOrderingReconciliation(
  coordinationId: unknown,
  before: unknown,
  command: unknown,
  observed: unknown
): OAuthOrderingReconciliationResult {
  if (
    typeof coordinationId !== "string" ||
    !UUID.test(coordinationId) ||
    !validSnapshot(before)
  ) {
    return result("unresolved");
  }

  const decision = modelOAuthRevocationOrdering(
    before,
    command
  );

  if (!decision.accepted) {
    return result("unresolved");
  }

  if (!validSnapshot(observed)) {
    return result("unresolved");
  }

  if (sameSnapshot(observed, decision.next)) {
    return result("consistent_unproven");
  }

  if (observed.revision === before.revision &&
      sameSnapshot(observed, before)) {
    return result("not_observed");
  }

  if (observed.revision > decision.next.revision) {
    return result("superseded");
  }

  return result("unresolved");
}
