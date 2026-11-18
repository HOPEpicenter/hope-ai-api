/**
 * K358EQ: Synthetic first-administrator atomic transaction planner.
 *
 * No Azure SDK, storage client, HTTP client, credentials, or writes.
 * This is NOT an executable transaction or bootstrap authority.
 *
 * Matching partition keys establish only a possible local
 * transaction boundary. They do NOT establish global Entra
 * binding uniqueness, projection compatibility, writer isolation,
 * or the right to create a Staff identity.
 */

export type KioskAtomicBootstrapInput = Readonly<{
  environment?: unknown;
  backend?: unknown;
  directoryCount?: unknown;
  writerMode?: unknown;
  staffPartition?: unknown;
  reservationPartition?: unknown;
  operationId?: unknown;
  ownerIdentityVerified?: unknown;
}>;

export type KioskAtomicBootstrapPlan = Readonly<{
  status: "denied" | "review_only";
  reason: string;
  transactionPartition: string | null;
  logicalOperations: readonly (
    "reserve_first_admin" | "create_canonical_staff"
  )[];
  globalBindingUniquenessProven: false;
  projectionCompatibilityProven: false;
  writerIsolationProven: false;
  executionPermitted: false;
  staffCreationPermitted: false;
  authorizationGranted: false;
  retryPermitted: false;
}>;

const EXPECTED_ENVIRONMENT =
  "hope-kiosk-frontend-20261122";

const EXPECTED_BACKEND =
  "https://hope-kiosk-acceptance-api.azurewebsites.net/api";

const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STAFF_ID = /^staff-[a-z0-9]{16,64}$/;

function decision(
  reason: string,
  partition: string | null = null
): KioskAtomicBootstrapPlan {
  const review = reason === "TRUSTED_COORDINATOR_REQUIRED";

  return {
    status: review ? "review_only" : "denied",
    reason,
    transactionPartition: review ? partition : null,
    logicalOperations: review
      ? ["reserve_first_admin", "create_canonical_staff"]
      : [],
    globalBindingUniquenessProven: false,
    projectionCompatibilityProven: false,
    writerIsolationProven: false,
    executionPermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    retryPermitted: false
  };
}

export function planKioskAtomicBootstrap(
  input: KioskAtomicBootstrapInput | null | undefined
): KioskAtomicBootstrapPlan {
  if (!input || typeof input !== "object" ||
      Array.isArray(input)) {
    return decision("INPUT_INVALID");
  }

  if (
    input.environment !== EXPECTED_ENVIRONMENT ||
    input.backend !== EXPECTED_BACKEND
  ) {
    return decision("ISOLATION_MISMATCH");
  }

  if (input.directoryCount !== 0) {
    return decision("EMPTY_DIRECTORY_NOT_ESTABLISHED");
  }

  if (input.writerMode !== "legacy") {
    return decision("WRITER_MODE_NOT_REVIEW_ELIGIBLE");
  }

  if (input.ownerIdentityVerified !== true) {
    return decision("OWNER_IDENTITY_NOT_VERIFIED");
  }

  if (
    typeof input.operationId !== "string" ||
    !GUID.test(input.operationId)
  ) {
    return decision("OPERATION_ID_INVALID");
  }

  if (
    typeof input.staffPartition !== "string" ||
    !STAFF_ID.test(input.staffPartition) ||
    typeof input.reservationPartition !== "string" ||
    input.reservationPartition.length === 0
  ) {
    return decision("PARTITION_INVALID");
  }

  if (input.staffPartition !== input.reservationPartition) {
    return decision("CROSS_PARTITION_TRANSACTION_DENIED");
  }

  // Even matching caller-controlled metadata is NOT authority.
  // A future trusted coordinator must prove storage semantics,
  // global binding uniqueness and isolation independently.
  return decision(
    "TRUSTED_COORDINATOR_REQUIRED",
    input.staffPartition
  );
}
