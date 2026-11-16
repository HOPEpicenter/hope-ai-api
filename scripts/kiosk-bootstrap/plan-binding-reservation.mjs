import { createHash } from "node:crypto";

/**
 * Kiosk bootstrap global Entra-binding reservation design.
 *
 * No storage client, network calls, or mutation authority.
 * This is NOT a cross-partition atomic Staff creation.
 */

const guid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const RESERVATION_PARTITION =
  "kiosk-entra-binding-ownership-v1";

export function planBindingReservation(input) {
  const deny = (status) => Object.freeze({
    status,
    executionPermitted: false,
    reservationWritePermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    automaticRetryPermitted: false,
    crossPartitionAtomicityProven: false,
    plan: null
  });

  if (!input || typeof input !== "object" ||
      Array.isArray(input)) {
    return deny("INVALID_INPUT");
  }

  const tenant = typeof input.tenantId === "string"
    ? input.tenantId.toLowerCase() : "";
  const object = typeof input.objectId === "string"
    ? input.objectId.toLowerCase() : "";
  const staff = typeof input.staffId === "string"
    ? input.staffId : "";
  const operation = typeof input.operationId === "string"
    ? input.operationId : "";

  if (!guid.test(tenant) || !guid.test(object) ||
      tenant !== "783ef4b1-7e96-4a71-80dd-06865b015da9") {
    return deny("IDENTITY_SCOPE_NOT_VERIFIED");
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(staff) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(operation)) {
    return deny("OPERATION_OR_STAFF_ID_INVALID");
  }

  if (input.existingBindingAbsentVerified !== true) {
    return deny("EXISTING_BINDING_STATE_UNVERIFIED");
  }

  // Identical Entra bindings always map to the same unique key,
  // regardless of which Staff ID attempts to claim them.
  const digest = createHash("sha256")
    .update(`hope-kiosk-binding-v1:${tenant}:${object}`)
    .digest("hex");

  const plan = Object.freeze({
    partitionKey: RESERVATION_PARTITION,
    rowKey: digest,
    staffId: staff,
    operationId: operation,
    storageIntent: "CONDITIONAL_CREATE_ONLY",
    conflictDisposition: "DENY",
    uncertainOutcomeDisposition: "STOP_AND_RECONCILE",
    crossPartitionCommit: "NOT_ATOMIC"
  });

  return Object.freeze({
    status: "DESIGN_ONLY_EXECUTION_DISABLED",
    executionPermitted: false,
    reservationWritePermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    automaticRetryPermitted: false,
    crossPartitionAtomicityProven: false,
    plan
  });
}