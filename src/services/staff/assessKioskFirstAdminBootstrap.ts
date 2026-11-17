/**
 * Isolated kiosk first-administrator bootstrap assessment.
 *
 * Offline decision helper only. Caller-supplied evidence is not
 * authentication or authorization. Never use this result to
 * execute a Staff write or grant a login session.
 *
 * No storage, network, Azure, or HTTP dependencies.
 */

export type KioskBootstrapEvidence = {
  siteName?: unknown;
  backendUrl?: unknown;
  canonicalStaffCount?: unknown;
  writerMode?: unknown;
  tenantId?: unknown;
  objectId?: unknown;
  identityVerified?: unknown;
};

export type KioskBootstrapAssessment = Readonly<{
  eligibleForReview: boolean;
  executionPermitted: false;
  authorizationGranted: false;
  staffMutationPermitted: false;
  reason: string;
}>;

const SITE = "hope-kiosk-frontend-20261122";
const BACKEND =
  "https://hope-kiosk-acceptance-api.azurewebsites.net/api";

const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decision(
  eligibleForReview: boolean,
  reason: string
): KioskBootstrapAssessment {
  return {
    eligibleForReview,
    executionPermitted: false,
    authorizationGranted: false,
    staffMutationPermitted: false,
    reason
  };
}

export function assessKioskFirstAdminBootstrap(
  evidence: KioskBootstrapEvidence | null | undefined
): KioskBootstrapAssessment {
  if (!evidence || typeof evidence !== "object") {
    return decision(false, "EVIDENCE_MISSING");
  }

  if (
    evidence.siteName !== SITE ||
    evidence.backendUrl !== BACKEND
  ) {
    return decision(false, "ISOLATION_MISMATCH");
  }

  if (
    !Number.isSafeInteger(evidence.canonicalStaffCount) ||
    evidence.canonicalStaffCount !== 0
  ) {
    return decision(false, "DIRECTORY_NOT_PROVEN_EMPTY");
  }

  if (evidence.writerMode !== "legacy") {
    return decision(false, "WRITER_MODE_NOT_ELIGIBLE");
  }

  if (
    typeof evidence.tenantId !== "string" ||
    typeof evidence.objectId !== "string" ||
    !GUID.test(evidence.tenantId) ||
    !GUID.test(evidence.objectId)
  ) {
    return decision(false, "IDENTITY_FORMAT_INVALID");
  }

  if (evidence.identityVerified !== true) {
    return decision(false, "IDENTITY_NOT_VERIFIED");
  }

  // Even fully matching evidence never authorizes execution.
  return decision(true, "REVIEW_REQUIRED");
}
