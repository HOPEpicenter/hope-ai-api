import {
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

import {
  verifySignedBootstrapApproval
} from "./verify-signed-approval.mjs";

/**
 * K371: Trusted owner and key-selection boundary.
 *
 * Dependencies must eventually be independently authenticated
 * and controlled. This module does not implement Entra token
 * validation or trusted key provisioning.
 *
 * No ledger consumer, Table client, Azure endpoint, or Staff
 * writer is available through this interface.
 */

const PURPOSE = "FIRST_CANONICAL_STAFF_BOOTSTRAP";
const ID = /^[A-Za-z0-9_-]{8,128}$/;
const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function deny(status) {
  return Object.freeze({
    status,
    signatureValid: false,
    authenticatedOwnerMatched: false,
    trustedKeyMatched: false,
    executionPermitted: false,
    reservationWritePermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    approvalConsumptionPermitted: false,
    realIdentityProviderVerified: false
  });
}

export function createTrustedBootstrapGate(config, dependencies) {
  if (
    !config ||
    !GUID.test(config.ownerTenantId ?? "") ||
    !GUID.test(config.ownerObjectId ?? "") ||
    !ID.test(config.keyId ?? "") ||
    config.ownerTenantId !== KIOSK_BOOTSTRAP_TARGET.tenantId ||
    !dependencies ||
    typeof dependencies.authenticateOwner !== "function" ||
    typeof dependencies.resolvePublicKey !== "function"
  ) {
    throw new TypeError("TRUSTED_GATE_CONFIGURATION_REQUIRED");
  }

  // Capture only expected identifiers. A request cannot
  // replace them or supply its own public key.
  const ownerTenantId = config.ownerTenantId;
  const ownerObjectId = config.ownerObjectId;
  const keyId = config.keyId;

  return Object.freeze({
    async assess(request) {
      if (
        !request ||
        typeof request !== "object" ||
        !ID.test(request.operationId ?? "") ||
        !request.envelope
      ) {
        return deny("INVALID_REQUEST");
      }

      let identity;

      try {
        identity = await dependencies.authenticateOwner();
      } catch {
        return deny("OWNER_AUTHENTICATION_FAILED");
      }

      if (
        !identity ||
        identity.authenticated !== true ||
        identity.tenantId !== ownerTenantId ||
        identity.objectId !== ownerObjectId
      ) {
        return deny("OWNER_IDENTITY_MISMATCH");
      }

      let keyRecord;

      try {
        keyRecord = await dependencies.resolvePublicKey(keyId);
      } catch {
        return deny("TRUSTED_KEY_UNAVAILABLE");
      }

      if (
        !keyRecord ||
        keyRecord.keyId !== keyId ||
        keyRecord.active !== true ||
        typeof keyRecord.publicKeyPem !== "string"
      ) {
        return deny("TRUSTED_KEY_MISMATCH");
      }

      const verification = verifySignedBootstrapApproval(
        request.envelope,
        {
          operationId: request.operationId,
          purpose: PURPOSE,
          target: { ...KIOSK_BOOTSTRAP_TARGET }
        },
        {
          keyId,
          ownerObjectId,
          publicKeyPem: keyRecord.publicKeyPem,
          nowMs: Date.now()
        }
      );

      if (verification.signatureValid !== true) {
        return deny("SIGNED_APPROVAL_INVALID");
      }

      // This is a testable trust-contract assessment.
      // Neither a synthetic identity provider nor a valid
      // signature constitutes bootstrap authority.
      return Object.freeze({
        ...deny("TRUST_CONTRACT_MATCHED_EXECUTION_DISABLED"),
        signatureValid: true,
        authenticatedOwnerMatched: true,
        trustedKeyMatched: true
      });
    }
  });
}