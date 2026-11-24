import type { TransactionAction } from "@azure/data-tables";

import type {
  ReservationRow,
  PermanentQrReservationStore
} from "../services/visitors/reservePermanentVisitorQrAdmission";

type TransactionClient = {
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<unknown>;

  submitTransaction(
    actions: TransactionAction[]
  ): Promise<{
    status: number;
    subResponses: readonly { status: number }[];
  }>;
};

function errorMatches(
  error: unknown,
  status: number,
  codes: readonly string[]
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as {
    statusCode?: unknown;
    code?: unknown;
    details?: {
      errorCode?: unknown;
      odataError?: {
        code?: unknown;
      };
    };
  };

  if (value.statusCode !== status) {
    return false;
  }

  // SDK single-operation and transaction errors can
  // expose service codes through different properties.
  const reported = [
    value.code,
    value.details?.errorCode,
    value.details?.odataError?.code
  ].filter(code => code !== undefined);

  // Require explicit, consistent, recognized service codes.
  // Never classify an unknown error by HTTP status alone.
  return reported.length > 0 &&
    reported.every(code =>
      typeof code === "string" &&
      codes.includes(code)
    ) &&
    new Set(reported).size === 1;
}

function readRow(input: unknown): ReservationRow {
  if (!input || typeof input !== "object") {
    throw new Error("INVALID_RESERVATION_ROW");
  }

  const row = input as Record<string, unknown>;

  const fields = [
    "partitionKey",
    "rowKey",
    "grantId",
    "submissionId",
    "claimHash",
    "slotKey"
  ] as const;

  for (const field of fields) {
    if (typeof row[field] !== "string" ||
        !(row[field] as string).length) {
      throw new Error("INVALID_RESERVATION_ROW");
    }
  }

  if (!/^[0-9a-f]{64}$/.test(row.claimHash as string)) {
    throw new Error("INVALID_RESERVATION_HASH");
  }

  // Return only the reservation contract.
  // SDK metadata and unexpected properties are excluded.
  return {
    partitionKey: row.partitionKey as string,
    rowKey: row.rowKey as string,
    grantId: row.grantId as string,
    submissionId: row.submissionId as string,
    claimHash: row.claimHash as string,
    slotKey: row.slotKey as string
  };
}

/**
 * Internal storage adapter only.
 *
 * The trusted caller must supply an explicitly selected
 * table client and establish admission independently.
 *
 * No default client, environment connection string,
 * table creation, upsert or visitor persistence.
 */
export function createPermanentVisitorQrReservationStore(
  client: TransactionClient
): PermanentQrReservationStore {
  return {
    async read(partitionKey, rowKey) {
      try {
        const row = readRow(
          await client.getEntity(partitionKey, rowKey)
        );

        if (row.partitionKey !== partitionKey ||
            row.rowKey !== rowKey) {
          throw new Error("RESERVATION_IDENTITY_MISMATCH");
        }

        return row;
      } catch (error) {
        if (errorMatches(error, 404, [
          "ResourceNotFound",
          "EntityNotFound"
        ])) {
          return null;
        }

        throw error;
      }
    },

    async createAll(input) {
      if (input.length !== 3) {
        throw new Error("EXACT_THREE_ROWS_REQUIRED");
      }

      const rows = input.map(readRow);
      const first = rows[0];

      const expectedKeys = new Set([
        `grant__${first.grantId}`,
        `submission__${first.submissionId}`,
        first.slotKey
      ]);

      if (expectedKeys.size !== 3 ||
          !/^slot__\d+__\d{3}$/.test(first.slotKey) ||
          new Set(rows.map(row => row.rowKey)).size !== 3 ||
          rows.some(row =>
            row.partitionKey !== first.partitionKey ||
            row.grantId !== first.grantId ||
            row.submissionId !== first.submissionId ||
            row.claimHash !== first.claimHash ||
            row.slotKey !== first.slotKey ||
            !expectedKeys.has(row.rowKey)
          )) {
        throw new Error("INVALID_ATOMIC_RESERVATION_BINDING");
      }

      const actions: TransactionAction[] = rows.map(
        row => ["create", { ...row }]
      );

      try {
        const response = await client.submitTransaction(actions);

        if (response.status < 200 ||
            response.status >= 300 ||
            response.subResponses.length !== 3 ||
            response.subResponses.some(item =>
              !Number.isInteger(item.status) ||
              item.status < 200 ||
              item.status >= 300
            )) {
          throw new Error("UNCERTAIN_TRANSACTION_RESPONSE");
        }

        return "created";

      } catch (error) {
        if (errorMatches(error, 409, [
          "EntityAlreadyExists"
        ])) {
          return "conflict";
        }

        // Unknown outcomes are never converted to success.
        throw error;
      }
    }
  };
}
