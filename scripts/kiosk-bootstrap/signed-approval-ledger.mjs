import { createHash } from "node:crypto";
import {
  verifySignedBootstrapApproval
} from "./verify-signed-approval.mjs";

/**
 * K369: Test-only signed approval and transaction integration.
 *
 * The caller supplies a trusted-key context and transaction
 * dependency. This module does NOT establish key custody,
 * real owner authentication, or bootstrap authority.
 *
 * No Azure client construction, credential loading, Staff
 * writer, or deployment entry point exists here.
 *
 * Transaction port is storage-capable: never inject a live
 * client without a separate implementation review and approval.
 */

const PARTITION = "kiosk-bootstrap-approval-v1";

function denied(status) {
  return Object.freeze({
    status,
    signatureValid: false,
    approvalConsumedForDesign: false,
    executionPermitted: false,
    reservationWritePermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    automaticRetryPermitted: false,
    realOwnerAuthorityVerified: false
  });
}

function approvalKey(operationId) {
  return createHash("sha256")
    .update(`hope-bootstrap-approval-v1:${operationId}`)
    .digest("hex");
}

export function createSignedApprovalLedger(port) {
  if (!port ||
      typeof port.submitTransaction !== "function" ||
      typeof port.getEntity !== "function") {
    throw new TypeError("TRANSACTION_AND_READ_PORT_REQUIRED");
  }

  return Object.freeze({
    async consumeForDesign(envelope, expected, trusted) {
      // The trusted context must be independently provisioned
      // in a future approved implementation, not provided by
      // untrusted user input.
      const verified = verifySignedBootstrapApproval(
        envelope, expected, trusted
      );

      if (
        verified.signatureValid !== true ||
        verified.verified !== false ||
        verified.authorizationGranted !== false
      ) {
        return denied("SIGNED_APPROVAL_NOT_ACCEPTED");
      }

      const rowKey = approvalKey(expected.operationId);
      const signatureDigest = createHash("sha256")
        .update(envelope.signature)
        .digest("hex");

      const claim = {
        partitionKey: PARTITION,
        rowKey: `claim_${rowKey}`,
        operationId: expected.operationId,
        signingKeyId: trusted.keyId,
        signatureDigest,
        state: "DESIGN_CONSUMED",
        protocolVersion: 1
      };

      const receipt = {
        partitionKey: PARTITION,
        rowKey: `audit_${rowKey}`,
        operationId: expected.operationId,
        signingKeyId: trusted.keyId,
        signatureDigest,
        eventType: "SIGNED_APPROVAL_DESIGN_CONSUMPTION",
        state: "RECORDED",
        protocolVersion: 1
      };

      // Same partition: intended for a single atomic
      // create-only transaction. No update, delete or upsert.
      // A real Table adapter must preserve atomicity.
      try {
        await port.submitTransaction([
          ["create", claim],
          ["create", receipt]
        ]);
      } catch (error) {
        if (error?.statusCode === 409 ||
            error?.statusCode === 412) {
          return denied("ALREADY_CONSUMED_OR_CONFLICT");
        }
        return denied("OUTCOME_UNKNOWN_STOP_AND_RECONCILE");
      }

      return Object.freeze({
        ...denied("DESIGN_CONSUMPTION_ACKNOWLEDGED"),
        signatureValid: true,
        approvalConsumedForDesign: true
      });
    },

    async inspectForDesign(operationId) {
      if (typeof operationId !== "string" ||
          !/^[A-Za-z0-9_-]{8,128}$/.test(operationId)) {
        return denied("INVALID_OPERATION");
      }

      const rowKey = approvalKey(operationId);

      let claim;
      let receipt;

      try {
        claim = await port.getEntity(
          PARTITION, `claim_${rowKey}`
        );
        receipt = await port.getEntity(
          PARTITION, `audit_${rowKey}`
        );
      } catch {
        return denied("RECONCILIATION_INCOMPLETE_STOP");
      }

      if (
        claim?.operationId !== operationId ||
        receipt?.operationId !== operationId ||
        claim?.state !== "DESIGN_CONSUMED" ||
        receipt?.state !== "RECORDED" ||
        claim?.protocolVersion !== 1 ||
        receipt?.protocolVersion !== 1 ||
        claim?.signingKeyId !== receipt?.signingKeyId ||
        claim?.signatureDigest !== receipt?.signatureDigest ||
        !/^[0-9a-f]{64}$/.test(claim?.signatureDigest ?? "") ||
        receipt?.eventType !==
          "SIGNED_APPROVAL_DESIGN_CONSUMPTION"
      ) {
        return denied("AUDIT_MISMATCH_STOP");
      }

      // A matching read-only observation is not Staff
      // authorization and cannot re-enable a spent approval.
      return denied("DESIGN_RECEIPT_RECONCILED_READ_ONLY");
    }
  });
}