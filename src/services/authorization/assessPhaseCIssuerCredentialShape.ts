/**
 * Phase C independent issuer credential-shape foundation.
 *
 * Validating a proposed claim set does not prove its origin,
 * its approval provenance, or permission to issue a credential.
 *
 * No signer, endpoint, key access, Azure call, or execution.
 */

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const FIELDS = [
  "iss",
  "aud",
  "iat",
  "exp",
  "jti",
  "operationId",
  "requestId",
  "resourceScope",
  "runbookName",
  "approvalProvenance",
  "oneTimeUse"
] as const;

export type PhaseCIssuerShapeAssessment = Readonly<{
  status: "valid_shape_only" | "invalid";
  issuanceAuthorized: false;
  executionAuthorized: false;
  retryAuthorized: false;
}>;

function result(
  status: PhaseCIssuerShapeAssessment["status"]
): PhaseCIssuerShapeAssessment {
  return {
    status,
    issuanceAuthorized: false,
    executionAuthorized: false,
    retryAuthorized: false
  };
}

function exactText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value;
}

/**
 * Shape verification only. In particular, approvalProvenance
 * is treated as untrusted text, not independently verified proof.
 */
export function assessPhaseCIssuerCredentialShape(
  input: unknown,
  nowUtc: number
): PhaseCIssuerShapeAssessment {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !Number.isSafeInteger(nowUtc) ||
    nowUtc < 0
  ) {
    return result("invalid");
  }

  const value = input as Record<string, unknown>;
  const keys = Object.keys(value);

  if (
    keys.length !== FIELDS.length ||
    keys.some(key => !FIELDS.includes(
      key as (typeof FIELDS)[number]
    ))
  ) {
    return result("invalid");
  }

  if (
    !exactText(value.iss) ||
    !exactText(value.aud) ||
    !exactText(value.resourceScope) ||
    !exactText(value.runbookName) ||
    !exactText(value.approvalProvenance) ||
    typeof value.operationId !== "string" ||
    !UUID4.test(value.operationId) ||
    typeof value.requestId !== "string" ||
    !UUID4.test(value.requestId) ||
    typeof value.jti !== "string" ||
    !UUID4.test(value.jti) ||
    new Set([
      value.operationId,
      value.requestId,
      value.jti
    ]).size !== 3 ||
    value.oneTimeUse !== true ||
    !Number.isSafeInteger(value.iat) ||
    !Number.isSafeInteger(value.exp)
  ) {
    return result("invalid");
  }

  const issued = value.iat as number;
  const expires = value.exp as number;

  if (
    issued > nowUtc ||
    expires <= nowUtc ||
    expires <= issued ||
    expires - issued > 300
  ) {
    return result("invalid");
  }

  // Shape validity is never issuance authorization.
  return result("valid_shape_only");
}