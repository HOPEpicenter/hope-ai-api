/**
 * OAuth execution fence metadata v1.
 *
 * CONTRACT ONLY. No storage, lease acquisition, revocation,
 * authorization, credential access, or external execution.
 *
 * Every applicable revocation pathway must participate in a
 * proven coordination protocol before any claim may be used
 * as part of a future execution mechanism.
 *
 * A record, token, or positive inspection result is NEVER
 * independent permission to execute an OAuth operation.
 */

import type {
  OAuthSensitiveOperationV1
} from "./oauthSessionPossession.v1";

export const OAUTH_EXECUTION_FENCE_SCHEMA_VERSION = 1 as const;

export type OAuthExecutionFenceStateV1 =
  | "claimed"
  | "completed"
  | "cancelled"
  | "uncertain";

export interface OAuthExecutionFenceRecordV1 {
  schemaVersion: 1;
  fenceId: string;
  credentialId: string;
  sessionBindingId: string;
  operation: OAuthSensitiveOperationV1;
  state: OAuthExecutionFenceStateV1;
  fencingRevision: number;
  expectedSessionRevision: number;
  expectedCredentialRevision: number;
  claimedAt: string;
  expiresAt: string;
  resolvedAt: string | null;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const KEYS = [
  "schemaVersion",
  "fenceId",
  "credentialId",
  "sessionBindingId",
  "operation",
  "state",
  "fencingRevision",
  "expectedSessionRevision",
  "expectedCredentialRevision",
  "claimedAt",
  "expiresAt",
  "resolvedAt"
] as const;

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" ||
      !TIMESTAMP.test(value)) return false;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value;
}

function revision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < Number.MAX_SAFE_INTEGER;
}

/**
 * Strict structural validation of a storage snapshot.
 * Validation does NOT establish its provenance, freshness,
 * ETag identity or relationship to revocation transactions.
 */
export function isOAuthExecutionFenceRecordV1(
  value: unknown
): value is OAuthExecutionFenceRecordV1 {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) return false;

  const v = value as Record<string, unknown>;

  if (
    Object.keys(v).length !== KEYS.length ||
    !KEYS.every(key =>
      Object.prototype.hasOwnProperty.call(v, key)
    ) ||
    v.schemaVersion !== 1 ||
    typeof v.fenceId !== "string" ||
    !UUID.test(v.fenceId) ||
    typeof v.credentialId !== "string" ||
    !UUID.test(v.credentialId) ||
    typeof v.sessionBindingId !== "string" ||
    !UUID.test(v.sessionBindingId) ||
    (
      v.operation !== "credential_read" &&
      v.operation !== "credential_rotate" &&
      v.operation !== "credential_revoke"
    ) ||
    (
      v.state !== "claimed" &&
      v.state !== "completed" &&
      v.state !== "cancelled" &&
      v.state !== "uncertain"
    ) ||
    !revision(v.fencingRevision) ||
    !revision(v.expectedSessionRevision) ||
    !revision(v.expectedCredentialRevision) ||
    !timestamp(v.claimedAt) ||
    !timestamp(v.expiresAt) ||
    Date.parse(v.claimedAt) >= Date.parse(v.expiresAt)
  ) {
    return false;
  }

  if (v.state === "claimed") {
    return v.resolvedAt === null;
  }

  return timestamp(v.resolvedAt) &&
    Date.parse(v.resolvedAt) >= Date.parse(v.claimedAt);
}

export type OAuthExecutionFenceInspectionV1 =
  | { recognized: true; executionPermitted: false;
      requiresAtomicCoordination: true }
  | { recognized: false; executionPermitted: false;
      requiresAtomicCoordination: true };

/**
 * This deliberately NEVER permits execution.
 *
 * A claimed record is not a storage lock, a lease is not
 * an execution guarantee, and an expired claim does not
 * establish that an external operation has stopped.
 *
 * "uncertain" must require an independently proven
 * reconciliation protocol before recovery or retry.
 */
export function inspectOAuthExecutionFenceV1(
  value: unknown
): OAuthExecutionFenceInspectionV1 {
  return {
    recognized: isOAuthExecutionFenceRecordV1(value),
    executionPermitted: false,
    requiresAtomicCoordination: true
  };
}
