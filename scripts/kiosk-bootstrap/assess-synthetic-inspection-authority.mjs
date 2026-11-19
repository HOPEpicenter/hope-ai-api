import { createPublicKey, verify } from "node:crypto";
import {
  isExpectedSyntheticIntakeFingerprint
} from "./simulate-synthetic-intake-cleanup.mjs";

// Offline contract assessment only: supplied context is never trusted authority.
const OPERATION = "kiosk.synthetic-intake.inspect-one.v1";
const SCOPE = Object.freeze({
  subscription: "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
  resourceGroup: "rg-hope-kiosk-acceptance-20261122",
  account: "sthopekiad20261122",
  table: "KioskIntakeSubmissions",
  partition: "friends-family-2026-11-22"
});
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9_-]{8,128}(?![\s\S])/;

function denied(status, signatureMatchesSuppliedKey = false) {
  return Object.freeze({
    status,
    signatureMatchesSuppliedKey,
    operatorVerified: false,
    issuerAuthorized: false,
    uuidEvidenceVerified: false,
    replayProtectionVerified: false,
    approvalConsumptionPermitted: false,
    inspectionAuthorized: false,
    executionPermitted: false,
    cleanupAuthorized: false
  });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}

function validTarget(target) {
  const keys = [...Object.keys(SCOPE), "submissionId", "payloadFingerprint"];
  return exactKeys(target, keys) &&
    Object.entries(SCOPE).every(([key, value]) => target[key] === value) &&
    typeof target.submissionId === "string" &&
    target.submissionId.length === 36 && UUID4.test(target.submissionId) &&
    isExpectedSyntheticIntakeFingerprint(target.payloadFingerprint);
}

function validOperator(operator) {
  return exactKeys(operator, ["tenantId", "objectId"]) &&
    typeof operator.tenantId === "string" &&
    operator.tenantId.length === 36 && GUID.test(operator.tenantId) &&
    typeof operator.objectId === "string" &&
    operator.objectId.length === 36 && GUID.test(operator.objectId);
}

function validContextString(value) {
  return typeof value === "string" && value.length > 0 &&
    value.length <= 256 && value.trim() === value && !/\s/.test(value);
}

export function assessSyntheticInspectionAuthority(request, context) {
  if (!request || typeof request !== "object" ||
      request.operation !== OPERATION ||
      typeof request.operationId !== "string" ||
      !REFERENCE.test(request.operationId)) {
    return denied("OPERATION_INVALID");
  }
  if (!validTarget(request.target)) return denied("TARGET_INVALID");
  if (!validOperator(request.operator)) return denied("OPERATOR_INVALID");
  if (typeof request.uuidEvidence !== "string" ||
      !REFERENCE.test(request.uuidEvidence)) {
    return denied("UUID_EVIDENCE_MISSING");
  }
  if (!context || typeof context !== "object" ||
      !validContextString(context.issuer) ||
      !validContextString(context.audience) ||
      typeof context.keyId !== "string" || !REFERENCE.test(context.keyId) ||
      typeof context.publicKeyPem !== "string" ||
      context.publicKeyPem.length > 4096 ||
      !Number.isSafeInteger(context.nowMs)) {
    return denied("CONTEXT_INVALID");
  }

  const envelope = request.envelope;
  if (!envelope || typeof envelope !== "object" ||
      envelope.keyId !== context.keyId ||
      typeof envelope.payload !== "string" || envelope.payload.length > 4096 ||
      typeof envelope.signature !== "string" ||
      !/^[A-Za-z0-9+/]{86}==(?![\s\S])/.test(envelope.signature)) {
    return denied("APPROVAL_INVALID");
  }

  let key;
  try {
    key = createPublicKey(context.publicKeyPem);
  } catch {
    return denied("KEY_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") return denied("KEY_INVALID");
  if (!verify(null, Buffer.from(envelope.payload, "utf8"), key,
    Buffer.from(envelope.signature, "base64"))) {
    return denied("SIGNATURE_INVALID");
  }

  let claims;
  try {
    claims = JSON.parse(envelope.payload);
  } catch {
    return denied("APPROVAL_INVALID");
  }
  if (!exactKeys(claims, [
    "operation", "operationId", "target", "operator",
    "uuidEvidence", "issuer", "audience", "issuedAt", "expiresAt"
  ]) || claims.operation !== OPERATION ||
      claims.operationId !== request.operationId ||
      !validTarget(claims.target) ||
      claims.target.submissionId !== request.target.submissionId ||
      !validOperator(claims.operator) ||
      claims.operator.tenantId !== request.operator.tenantId ||
      claims.operator.objectId !== request.operator.objectId ||
      claims.uuidEvidence !== request.uuidEvidence ||
      claims.issuer !== context.issuer ||
      claims.audience !== context.audience) {
    return denied("APPROVAL_SCOPE_MISMATCH");
  }

  if (typeof claims.issuedAt !== "string" ||
      typeof claims.expiresAt !== "string") {
    return denied("APPROVAL_TIME_INVALID");
  }
  const issued = Date.parse(claims.issuedAt);
  const expires = Date.parse(claims.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) ||
      new Date(issued).toISOString() !== claims.issuedAt ||
      new Date(expires).toISOString() !== claims.expiresAt ||
      issued > context.nowMs || expires <= context.nowMs ||
      expires <= issued || expires - issued > 15 * 60 * 1000) {
    return denied("APPROVAL_TIME_INVALID");
  }

  return denied("EXECUTION_DISABLED_TRUST_AND_REPLAY_UNAVAILABLE", true);
}
