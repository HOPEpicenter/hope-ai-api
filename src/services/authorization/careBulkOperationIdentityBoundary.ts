/**
 * Advisory-only Bulk Care operation identity boundary.
 *
 * Correlation IDs are diagnostic labels, never operation or replay keys.
 * An explicit operation ID is only caller-supplied intent, not durable
 * identity, proof of uniqueness, staff authorization, or execution.
 *
 * No production handler integration, storage I/O, retry, or recovery.
 */

export type CareBulkOperationIdentityAssessment = Readonly<{
  status:
    | "explicit_operation_identity_unverified"
    | "missing_operation_identity"
    | "invalid_input";
  correlationId: string | null;
  operationId: string | null;
  durableIdentityVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const safety = {
  durableIdentityVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

function outcome(
  status: CareBulkOperationIdentityAssessment["status"],
  correlationId: string | null = null,
  operationId: string | null = null
): CareBulkOperationIdentityAssessment {
  return Object.freeze({
    status, correlationId, operationId, ...safety
  });
}

function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error("missing_or_accessor_property");
  }
  return descriptor.value;
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * Input has exactly two own data properties:
 * correlationId: string or null; operationId: string or null.
 * Null operationId means no explicit operation identity was supplied.
 *
 * No caller-supplied value is proof of durable idempotency.
 */
export function assessCareBulkOperationIdentity(
  input: unknown
): CareBulkOperationIdentityAssessment {
  const invalid = () => outcome("invalid_input");

  try {
    if (!input || typeof input !== "object" ||
        Array.isArray(input)) {
      return invalid();
    }

    const keys = Reflect.ownKeys(input);
    if (keys.length !== 2 ||
        !keys.includes("correlationId") ||
        !keys.includes("operationId")) {
      return invalid();
    }

    const correlationId = ownData(input, "correlationId");
    const operationId = ownData(input, "operationId");

    if ((correlationId !== null && !validId(correlationId)) ||
        (operationId !== null && !validId(operationId))) {
      return invalid();
    }

    if (operationId === null) {
      return outcome(
        "missing_operation_identity",
        correlationId as string | null
      );
    }

    return outcome(
      "explicit_operation_identity_unverified",
      correlationId as string | null,
      operationId as string
    );
  } catch {
    // Malformed evidence, accessors and hostile proxies fail closed.
    return invalid();
  }
}
