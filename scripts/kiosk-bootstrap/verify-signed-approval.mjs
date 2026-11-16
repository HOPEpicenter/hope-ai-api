import { createPublicKey, verify } from "node:crypto";
import {
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

/**
 * Offline cryptographic approval verification.
 *
 * A valid signature proves possession of the corresponding
 * signing key, not Staff authority or Entra authentication.
 *
 * The trusted key and expected owner identity must come from
 * independently controlled configuration, never the envelope.
 *
 * No key provisioning, Azure access, or Staff write is included.
 */

const purpose = "FIRST_CANONICAL_STAFF_BOOTSTRAP";
const id = /^[A-Za-z0-9_-]{8,128}$/;
const guid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const deny = (status) => Object.freeze({
  status,
  signatureValid: false,
  verified: false,
  ownerIdentityVerified: false,
  actorProvenanceVerified: false,
  executionPermitted: false,
  reservationWritePermitted: false,
  staffCreationPermitted: false,
  authorizationGranted: false,
  replayProtectionVerified: false
});

function exactTarget(target) {
  return !!target &&
    typeof target === "object" &&
    !Array.isArray(target) &&
    Object.entries(KIOSK_BOOTSTRAP_TARGET).every(
      ([key, value]) => target[key] === value
    ) &&
    Object.keys(target).length ===
      Object.keys(KIOSK_BOOTSTRAP_TARGET).length;
}

export function verifySignedBootstrapApproval(
  envelope,
  expected,
  trusted
) {
  if (!envelope || typeof envelope !== "object" ||
      !expected || typeof expected !== "object" ||
      !trusted || typeof trusted !== "object") {
    return deny("INVALID_INPUT");
  }

  if (!id.test(expected.operationId ?? "") ||
      !exactTarget(expected.target) ||
      expected.purpose !== purpose ||
      !guid.test(trusted.ownerObjectId ?? "") ||
      !id.test(trusted.keyId ?? "") ||
      typeof trusted.publicKeyPem !== "string" ||
      trusted.publicKeyPem.length > 4096 ||
      !Number.isSafeInteger(trusted.nowMs)) {
    return deny("TRUSTED_CONTEXT_INVALID");
  }

  if (envelope.keyId !== trusted.keyId ||
      typeof envelope.payload !== "string" ||
      envelope.payload.length > 4096 ||
      typeof envelope.signature !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) {
    return deny("ENVELOPE_INVALID");
  }

  let key;
  try {
    key = createPublicKey(trusted.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") {
      return deny("UNTRUSTED_KEY_TYPE");
    }
  } catch {
    return deny("TRUSTED_KEY_INVALID");
  }

  const bytes = Buffer.from(envelope.payload, "utf8");
  const signature = Buffer.from(envelope.signature, "base64");

  if (signature.length !== 64 ||
      !verify(null, bytes, key, signature)) {
    return deny("SIGNATURE_INVALID");
  }

  let claims;
  try {
    claims = JSON.parse(envelope.payload);
  } catch {
    return deny("SIGNED_PAYLOAD_INVALID");
  }

  if (!claims || typeof claims !== "object" ||
      Array.isArray(claims) ||
      Object.keys(claims).sort().join(",") !==
      [
        "expiresAt", "issuedAt", "operationId",
        "ownerObjectId", "purpose", "target"
      ].sort().join(",") ||
      claims.operationId !== expected.operationId ||
      claims.purpose !== purpose ||
      claims.ownerObjectId !== trusted.ownerObjectId ||
      !exactTarget(claims.target)) {
    return deny("SIGNED_SCOPE_MISMATCH");
  }

  const issued = Date.parse(claims.issuedAt);
  const expires = Date.parse(claims.expiresAt);

  if (!Number.isFinite(issued) ||
      !Number.isFinite(expires) ||
      new Date(issued).toISOString() !== claims.issuedAt ||
      new Date(expires).toISOString() !== claims.expiresAt ||
      issued > trusted.nowMs ||
      expires <= trusted.nowMs ||
      expires <= issued ||
      expires - issued > 15 * 60 * 1000) {
    return deny("APPROVAL_TIME_INVALID");
  }

  // Signature and scope are checked. Owner authentication,
  // signer authority, key custody, and one-time consumption
  // are separate prerequisites, not established here.
  return Object.freeze({
    ...deny("SIGNATURE_VALID_ADDITIONAL_AUTHORITY_REQUIRED"),
    signatureValid: true
  });
}