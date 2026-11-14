/**
 * Phase C durable credential-claim foundation.
 *
 * No endpoint, trusted issuer, authorization or Azure job execution.
 * Input is untrusted; claiming a record never grants permission.
 *
 * A dedicated table is required. All uniqueness keys share a single
 * partition and are created in one atomic transaction.
 */

import type {
  TableClient,
  TransactionAction
} from "@azure/data-tables";

const PARTITION = "phase-c-credential-use-v1";

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type PhaseCCredentialClaim = Readonly<{
  credentialId: string;
  operationId: string;
  requestId: string;
  expiresUtc: number;
}>;

export type PhaseCCredentialClaimResult = Readonly<{
  status: "claimed" | "invalid" | "conflict" | "uncertain";
  executionAuthorized: false;
  retryAuthorized: false;
}>;

function result(
  status: PhaseCCredentialClaimResult["status"]
): PhaseCCredentialClaimResult {
  return {
    status,
    executionAuthorized: false,
    retryAuthorized: false
  };
}

function validClaim(
  value: unknown,
  nowUtc: number
): value is PhaseCCredentialClaim {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return Object.keys(item).length === 4 &&
    Object.prototype.hasOwnProperty.call(item, "credentialId") &&
    Object.prototype.hasOwnProperty.call(item, "operationId") &&
    Object.prototype.hasOwnProperty.call(item, "requestId") &&
    Object.prototype.hasOwnProperty.call(item, "expiresUtc") &&
    typeof item.credentialId === "string" &&
    UUID4.test(item.credentialId) &&
    typeof item.operationId === "string" &&
    UUID4.test(item.operationId) &&
    typeof item.requestId === "string" &&
    UUID4.test(item.requestId) &&
    new Set([
      item.credentialId,
      item.operationId,
      item.requestId
    ]).size === 3 &&
    typeof item.expiresUtc === "number" &&
    Number.isSafeInteger(item.expiresUtc) &&
    item.expiresUtc > nowUtc &&
    item.expiresUtc <= nowUtc + 300;
}

function errorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;

  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : 0;
}

export class PhaseCOperationCredentialConsumptionRepository {
  constructor(private readonly table: TableClient) {}

  async claim(
    input: unknown
  ): Promise<PhaseCCredentialClaimResult> {
    // Time is obtained internally, never accepted from the caller.
    const nowUtc = Math.floor(Date.now() / 1000);

    if (!validClaim(input, nowUtc) ||
        !this.table ||
        typeof this.table.submitTransaction !== "function") {
      return result("invalid");
    }

    const claim = input as PhaseCCredentialClaim;

    const rows = [
      `credential-${claim.credentialId}`,
      `operation-${claim.operationId}`,
      `request-${claim.requestId}`
    ];

    const actions: TransactionAction[] = rows.map(rowKey => [
      "create",
      {
        partitionKey: PARTITION,
        rowKey,
        credentialId: claim.credentialId,
        operationId: claim.operationId,
        requestId: claim.requestId,
        expiresUtc: claim.expiresUtc,
        state: "CLAIMED_UNAUTHORIZED"
      }
    ]);

    try {
      await this.table.submitTransaction(actions);

      // A durable claim is never execution authorization.
      return result("claimed");
    } catch (error) {
      const status = errorStatus(error);

      if (status === 409 || status === 412) {
        return result("conflict");
      }

      // Unknown outcome: do not retry automatically.
      return result("uncertain");
    }
  }
}
