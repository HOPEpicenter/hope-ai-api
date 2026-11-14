/**
 * Phase C verification-to-claim boundary.
 *
 * This component never issues tokens, selects trusted keys from
 * caller input, authorizes operations, or creates Azure jobs.
 * Trusted infrastructure must configure its expected scope,
 * issuer, audience and signing-key resolver.
 *
 * No endpoint or execution gate is connected.
 */

import type { JWTVerifyGetKey } from "jose";
import {
  verifyPhaseCOperationCredential,
  type PhaseCOperationCredentialExpectation
} from "./verifyPhaseCOperationCredential";
import type {
  PhaseCOperationCredentialConsumptionRepository,
  PhaseCCredentialClaimResult
} from "../../repositories/phaseCOperationCredentialConsumptionRepository";

export type PhaseCVerifyAndClaimResult = Readonly<{
  status:
    | "verification_denied"
    | PhaseCCredentialClaimResult["status"];
  executionAuthorized: false;
  retryAuthorized: false;
}>;

export class PhaseCVerifyAndClaimOperationCredential {
  constructor(
    private readonly expected: PhaseCOperationCredentialExpectation,
    private readonly trustedSigningKey: JWTVerifyGetKey,
    private readonly repository:
      Pick<PhaseCOperationCredentialConsumptionRepository, "claim">
  ) {}

  async process(token: unknown): Promise<PhaseCVerifyAndClaimResult> {
    let verified;

    try {
      verified = await verifyPhaseCOperationCredential(
        token,
        this.expected,
        this.trustedSigningKey
      );
    } catch {
      return {
        status: "verification_denied",
        executionAuthorized: false,
        retryAuthorized: false
      };
    }

    // Never accept an externally supplied "verified" object.
    // All claim identifiers come from a freshly verified JWT.
    try {
      const claim = await this.repository.claim({
        credentialId: verified.credentialId,
        operationId: verified.operationId,
        requestId: verified.requestId,
        expiresUtc: verified.expiresUtc
      });

      return {
        status: claim.status,
        executionAuthorized: false,
        retryAuthorized: false
      };
    } catch {
      // No automatic retry after unknown storage outcome.
      return {
        status: "uncertain",
        executionAuthorized: false,
        retryAuthorized: false
      };
    }
  }
}
