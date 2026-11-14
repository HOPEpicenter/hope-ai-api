/**
 * Phase C signed operation credential verification foundation.
 *
 * No credential issuance, signing-key discovery, authorization,
 * one-time consumption, storage writes, or Azure execution.
 *
 * Only protected infrastructure may supply the trusted resolver
 * and exact expected issuer/audience.
 */

import {
  jwtVerify,
  type JWTVerifyGetKey
} from "jose";

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type PhaseCOperationCredentialExpectation = Readonly<{
  issuer: string;
  audience: string;
  operationId: string;
  requestId: string;
  resourceScope: string;
  runbookName: string;
}>;

export type VerifiedPhaseCOperationCredential = Readonly<{
  verified: true;
  operationId: string;
  requestId: string;
  resourceScope: string;
  runbookName: string;
  credentialId: string;
  expiresUtc: number;
  approvalProvenance: string;
  executionAuthorized: false;
  retryAuthorized: false;
}>;

function exactNonempty(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value;
}

export async function verifyPhaseCOperationCredential(
  token: unknown,
  expected: PhaseCOperationCredentialExpectation,
  trustedSigningKey: JWTVerifyGetKey
): Promise<VerifiedPhaseCOperationCredential> {
  if (
    !exactNonempty(token) ||
    !expected ||
    typeof trustedSigningKey !== "function" ||
    !exactNonempty(expected.issuer) ||
    !exactNonempty(expected.audience) ||
    !UUID4.test(expected.operationId) ||
    !UUID4.test(expected.requestId) ||
    expected.operationId === expected.requestId ||
    !exactNonempty(expected.resourceScope) ||
    !exactNonempty(expected.runbookName)
  ) {
    throw new Error("PHASE_C_CREDENTIAL_INVALID");
  }

  const { payload } = await jwtVerify(token, trustedSigningKey, {
    algorithms: ["RS256"],
    issuer: expected.issuer,
    audience: expected.audience,
    requiredClaims: ["iat", "exp", "jti"]
  });

  const now = Math.floor(Date.now() / 1000);

  if (
    payload.aud !== expected.audience ||
    payload.operationId !== expected.operationId ||
    payload.requestId !== expected.requestId ||
    payload.resourceScope !== expected.resourceScope ||
    payload.runbookName !== expected.runbookName ||
    payload.oneTimeUse !== true ||
    !exactNonempty(payload.approvalProvenance) ||
    !exactNonempty(payload.jti) ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.iat! > now ||
    payload.exp! <= payload.iat! ||
    payload.exp! - payload.iat! > 300 ||
    !UUID4.test(payload.jti)
  ) {
    throw new Error("PHASE_C_CREDENTIAL_SCOPE_INVALID");
  }

  return {
    verified: true,
    operationId: expected.operationId,
    requestId: expected.requestId,
    resourceScope: expected.resourceScope,
    runbookName: expected.runbookName,
    credentialId: payload.jti,
    expiresUtc: payload.exp!,
    approvalProvenance: payload.approvalProvenance,
    executionAuthorized: false,
    retryAuthorized: false
  };
}
