import {
  normalizeEntraStaffBinding
} from "../../domain/staff/projectStaffDirectory";

/**
 * Read-only preflight for linking an ALREADY EXISTING isolated kiosk
 * canonical Staff record. This is distinct from first-admin creation.
 *
 * All input is caller-supplied, including claims about directory source,
 * identity verification and owner approval. Only an independently trusted
 * authority reader and an exclusively fenced writer can act on it.
 *
 * Never use this decision to append StaffEvents, reserve a binding,
 * grant a session, activate Staff Authority or call Microsoft Graph.
 */
export type KioskExistingStaffBindingEvidence = Readonly<{
  siteName?: unknown;
  directorySource?: unknown;
  snapshotComplete?: unknown;
  staffDirectory?: unknown;
  staffId?: unknown;
  tenantId?: unknown;
  objectId?: unknown;
  identityVerified?: unknown;
  ownerApprovalVerified?: unknown;
}>;

export type KioskExistingStaffBindingAssessment = Readonly<{
  reviewEligible: boolean;
  reason: string;
  existingStaffCreationPermitted: false;
  staffMutationPermitted: false;
  authorityActivationPermitted: false;
  executionPermitted: false;
  authorizationGranted: false;
  retryPermitted: false;
}>;

const KIOSK_SITE = "hope-kiosk-acceptance-api";
const ISOLATED_SOURCE = "isolated_canonical_staff_events";
const STAFF_ID = /^staff-[a-z0-9]{16,64}$/;

function decision(
  reason: string,
  reviewEligible = false
): KioskExistingStaffBindingAssessment {
  return Object.freeze({
    reviewEligible,
    reason,
    existingStaffCreationPermitted: false,
    staffMutationPermitted: false,
    authorityActivationPermitted: false,
    executionPermitted: false,
    authorizationGranted: false,
    retryPermitted: false
  });
}

function object(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * A single, complete isolated-directory projection is necessary for
 * review, but is NOT an atomic binding-ownership proof.
 *
 * Missing records, partial bindings, duplicates, inactive targets and
 * conflicting ownership fail closed. The exact same binding on the
 * intended record still requires trusted authority verification.
 */
export function assessKioskExistingStaffBinding(
  evidence: unknown
): KioskExistingStaffBindingAssessment {
  const input = object(evidence);
  if (!input) return decision("EVIDENCE_MISSING");

  if (input.siteName !== KIOSK_SITE ||
      input.directorySource !== ISOLATED_SOURCE) {
    return decision("ISOLATED_SOURCE_NOT_ESTABLISHED");
  }

  if (input.snapshotComplete !== true ||
      !Array.isArray(input.staffDirectory) ||
      input.staffDirectory.length > 10000) {
    return decision("COMPLETE_DIRECTORY_NOT_ESTABLISHED");
  }

  if (input.identityVerified !== true ||
      input.ownerApprovalVerified !== true) {
    return decision("IDENTITY_OR_APPROVAL_NOT_ESTABLISHED");
  }

  if (typeof input.staffId !== "string" ||
      !STAFF_ID.test(input.staffId)) {
    return decision("STAFF_ID_INVALID");
  }

  const requested = normalizeEntraStaffBinding(
    input.tenantId, input.objectId
  );
  if (!requested) return decision("ENTRA_BINDING_INVALID");

  const staffIds = new Set<string>();
  let target: Record<string, unknown> | null = null;
  let requestedOwner: string | null = null;

  for (const item of input.staffDirectory) {
    const staff = object(item);
    if (!staff ||
        typeof staff.staffId !== "string" ||
        !STAFF_ID.test(staff.staffId) ||
        staffIds.has(staff.staffId) ||
        typeof staff.status !== "string") {
      return decision("DIRECTORY_INCONSISTENT");
    }
    staffIds.add(staff.staffId);

    const tenant = staff.entraTenantId;
    const principal = staff.entraObjectId;
    const noTenant = tenant === null || tenant === undefined;
    const noPrincipal = principal === null || principal === undefined;

    if (noTenant !== noPrincipal) {
      return decision("PARTIAL_BINDING_IN_DIRECTORY");
    }

    if (!noTenant && !noPrincipal) {
      const normalized = normalizeEntraStaffBinding(tenant, principal);
      if (!normalized) return decision("INVALID_EXISTING_BINDING");

      if (normalized.entraTenantId === requested.entraTenantId &&
          normalized.entraObjectId === requested.entraObjectId) {
        if (requestedOwner !== null) {
          return decision("CONFLICTING_BINDING_OWNERSHIP");
        }
        requestedOwner = staff.staffId;
      }
    }

    if (staff.staffId === input.staffId) target = staff;
  }

  if (!target) return decision("ISOLATED_STAFF_RECORD_NOT_FOUND");
  if (target.status !== "active") {
    return decision("TARGET_STAFF_NOT_ACTIVE");
  }

  if (requestedOwner !== null && requestedOwner !== input.staffId) {
    return decision("BINDING_OWNED_BY_ANOTHER_STAFF");
  }

  if (target.entraTenantId !== null &&
      target.entraTenantId !== undefined) {
    // A matching canonical projection is not authoritative evidence.
    const existing = normalizeEntraStaffBinding(
      target.entraTenantId, target.entraObjectId
    );
    if (existing?.entraTenantId === requested.entraTenantId &&
        existing?.entraObjectId === requested.entraObjectId) {
      return decision("ALREADY_BOUND_AUTHORITY_REVIEW_REQUIRED");
    }
    return decision("TARGET_BOUND_TO_DIFFERENT_IDENTITY");
  }

  // Review-only: another principal could race this snapshot. A durable
  // exclusive authority transaction, protected receipts and independent
  // verification are still required before a real binding is allowed.
  return decision("EXCLUSIVE_AUTHORITY_WRITER_REQUIRED", true);
}
