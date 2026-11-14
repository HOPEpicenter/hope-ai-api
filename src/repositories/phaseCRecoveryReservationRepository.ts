import type {
  TableClient,
  TransactionAction
} from "@azure/data-tables";

/**
 * Phase C durable reservation storage foundation.
 *
 * This repository owns no credentials, provisions no resources,
 * authorizes no execution and creates no Azure Automation jobs.
 *
 * A dedicated table must be supplied by trusted infrastructure.
 * All reservations use one partition to enforce global uniqueness
 * of both operation IDs and job-request IDs in one transaction.
 */

const PARTITION = "phase-c-recovery-v1";

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type PhaseCReservationRequest = Readonly<{
  operationId: string;
  requestId: string;
  createdUtc: number;
}>;

export type PhaseCReservationResult = Readonly<{
  status: "reserved" | "invalid" | "conflict" | "uncertain";
  executionAuthorized: false;
  retryAuthorized: false;
}>;

function result(
  status: PhaseCReservationResult["status"]
): PhaseCReservationResult {
  return {
    status,
    executionAuthorized: false,
    retryAuthorized: false
  };
}

function validRequest(value: unknown):
  value is PhaseCReservationRequest {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) {
    return false;
  }

  const request = value as Record<string, unknown>;

  return Object.keys(request).length === 3 &&
    Object.prototype.hasOwnProperty.call(request, "operationId") &&
    Object.prototype.hasOwnProperty.call(request, "requestId") &&
    Object.prototype.hasOwnProperty.call(request, "createdUtc") &&
    typeof request.operationId === "string" &&
    UUID4.test(request.operationId) &&
    typeof request.requestId === "string" &&
    UUID4.test(request.requestId) &&
    request.operationId !== request.requestId &&
    typeof request.createdUtc === "number" &&
    Number.isSafeInteger(request.createdUtc) &&
    request.createdUtc >= 0;
}

function errorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;

  const candidate = error as {
    statusCode?: unknown;
  };

  return typeof candidate.statusCode === "number"
    ? candidate.statusCode
    : 0;
}

export class PhaseCRecoveryReservationRepository {
  constructor(private readonly table: TableClient) {}

  async reserve(
    request: unknown
  ): Promise<PhaseCReservationResult> {
    if (!validRequest(request) ||
        !this.table ||
        typeof this.table.submitTransaction !== "function") {
      return result("invalid");
    }

    const actions: TransactionAction[] = [
      [
        "create",
        {
          partitionKey: PARTITION,
          rowKey: `operation-${request.operationId}`,
          operationId: request.operationId,
          requestId: request.requestId,
          createdUtc: request.createdUtc,
          state: "UNRESOLVED"
        }
      ],
      [
        "create",
        {
          partitionKey: PARTITION,
          rowKey: `request-${request.requestId}`,
          operationId: request.operationId,
          requestId: request.requestId,
          createdUtc: request.createdUtc,
          state: "UNRESOLVED"
        }
      ]
    ];

    try {
      await this.table.submitTransaction(actions);

      // Storage acknowledgement is not execution authorization.
      return result("reserved");
    } catch (error) {
      const status = errorStatus(error);

      if (status === 409 || status === 412) {
        return result("conflict");
      }

      // Timeout or unknown outcome: never blindly retry.
      return result("uncertain");
    }
  }
}
