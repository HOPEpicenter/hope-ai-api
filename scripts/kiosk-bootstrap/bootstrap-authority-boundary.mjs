import {
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

/**
 * Kiosk first-Staff bootstrap authorization boundary.
 *
 * The external verifier is a contract, not a built-in
 * identity or cryptographic verifier. No real verifier
 * or writer is wired here.
 *
 * Even a verified approval cannot authorize execution.
 */

const BOOTSTRAP_ACTOR = "kiosk_isolated_bootstrap_v1";

function deny(status, approvalReference = null) {
  return Object.freeze({
    status,
    approvalReference,
    bootstrapActor: BOOTSTRAP_ACTOR,
    executionPermitted: false,
    reservationWritePermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    automaticRetryPermitted: false,
    productionWriterFenced: false
  });
}

const exactTarget = (target) =>
  target !== null &&
  typeof target === "object" &&
  !Array.isArray(target) &&
  Object.entries(KIOSK_BOOTSTRAP_TARGET).every(
    ([key, value]) => target[key] === value
  );

const validRef = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]{8,128}$/.test(value);

export async function assessBootstrapAuthority(
  request,
  approvalVerifier
) {
  if (!request || typeof request !== "object" ||
      Array.isArray(request) ||
      !exactTarget(request.target)) {
    return deny("TARGET_NOT_VERIFIED");
  }

  if (!validRef(request.operationId)) {
    return deny("OPERATION_ID_INVALID");
  }

  if (!approvalVerifier ||
      typeof approvalVerifier.verify !== "function") {
    return deny("INDEPENDENT_VERIFIER_UNAVAILABLE");
  }

  let evidence;

  try {
    evidence = await approvalVerifier.verify(
      Object.freeze({
        operationId: request.operationId,
        target: Object.freeze({
          ...KIOSK_BOOTSTRAP_TARGET
        }),
        purpose: "FIRST_CANONICAL_STAFF_BOOTSTRAP"
      })
    );
  } catch {
    return deny("VERIFICATION_FAILED_CLOSED");
  }

  if (!evidence ||
      evidence.verified !== true ||
      evidence.purpose !== "FIRST_CANONICAL_STAFF_BOOTSTRAP" ||
      evidence.operationId !== request.operationId ||
      !exactTarget(evidence.target) ||
      !validRef(evidence.approvalReference) ||
      evidence.actorProvenanceVerified !== true ||
      evidence.ownerIdentityVerified !== true) {
    return deny("APPROVAL_EVIDENCE_NOT_VERIFIED");
  }

  // The external verifier must eventually validate actual
  // identity, scope, signed or durable approval, freshness,
  // single-use operation binding, and audit provenance.
  // This design module does none of those tasks itself.
  return deny(
    "VERIFIED_EVIDENCE_DESIGN_ONLY",
    evidence.approvalReference
  );
}