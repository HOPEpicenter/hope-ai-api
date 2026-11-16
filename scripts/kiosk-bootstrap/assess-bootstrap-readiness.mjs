/**
 * Isolated kiosk Staff bootstrap readiness classification.
 *
 * DESIGN ONLY. This module never authorizes execution,
 * reads Staff data, or writes to a storage resource.
 */

export const KIOSK_BOOTSTRAP_TARGET = Object.freeze({
  subscriptionId: "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
  tenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  resourceGroup: "rg-hope-kiosk-acceptance-20261122",
  functionApp: "hope-kiosk-acceptance-api"
});

export function assessKioskBootstrapReadiness(input) {
  const denied = (reason) => Object.freeze({
    status: reason,
    executionPermitted: false,
    staffMutationPermitted: false,
    automaticRetryPermitted: false,
    authorizationGranted: false,
    productionWriterFenced: false
  });

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return denied("INVALID_INPUT");
  }

  const target = input.target;

  if (!target || typeof target !== "object" ||
      Array.isArray(target)) {
    return denied("TARGET_NOT_VERIFIED");
  }

  for (const [key, value] of
       Object.entries(KIOSK_BOOTSTRAP_TARGET)) {
    if (target[key] !== value) {
      return denied("TARGET_NOT_VERIFIED");
    }
  }

  if (input.ownerIdentityVerified !== true) {
    return denied("OWNER_IDENTITY_NOT_VERIFIED");
  }

  if (input.canonicalBindingState !== "ABSENT_VERIFIED") {
    return denied("CANONICAL_BINDING_NOT_ESTABLISHED_AS_ABSENT");
  }

  if (input.canonicalWriterMode !== "legacy") {
    return denied("CANONICAL_WRITER_NOT_READY");
  }

  if (input.atomicReservationVerified !== true) {
    return denied("ATOMIC_RESERVATION_NOT_VERIFIED");
  }

  if (input.auditActorVerified !== true) {
    return denied("BOOTSTRAP_AUDIT_ACTOR_NOT_VERIFIED");
  }

  if (input.ownerExecutionApprovalVerified !== true) {
    return denied("EXECUTION_APPROVAL_NOT_VERIFIED");
  }

  // Even claims of complete evidence cannot enable execution.
  // A future implementation requires independent approval,
  // separate authenticated verification, and a reviewed writer.
  return denied("DESIGN_ONLY_EXECUTION_DISABLED");
}