import type { TableClient } from "@azure/data-tables";

export type PublicVisitRequestOperation =
  | "session"
  | "registration";

export type PublicVisitRequestBudgetResult =
  | "reserved"
  | "capacity_exhausted"
  | "unavailable";

export type RequestBudgetTable = Pick<
  TableClient,
  "getEntity" | "createEntity" | "updateEntity"
>;

export const PUBLIC_VISIT_REQUEST_LIMITS =
  Object.freeze({
    session: 120,
    registration: 180
  });

const MAX_ATTEMPTS = 4;

function statusIs(
  error: unknown,
  status: number
): boolean {
  return error !== null &&
    typeof error === "object" &&
    (error as {
      statusCode?: unknown
    }).statusCode === status;
}

/**
 * Independent global request budgets, applied
 * before calendar lookup and registration work.
 *
 * No visitor data, IP addresses, device identity
 * or session credentials are stored.
 *
 * One atomic counter per operation per minute.
 * Conditional writes prevent concurrent lost
 * updates. Uncertain writes never grant admission.
 */
export async function reservePermanentPublicVisitRequest(
  table: RequestBudgetTable,
  operation: PublicVisitRequestOperation,
  nowMs: number
): Promise<PublicVisitRequestBudgetResult> {
  if (
    (operation !== "session" &&
      operation !== "registration") ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  ) {
    return "unavailable";
  }

  const capacity =
    PUBLIC_VISIT_REQUEST_LIMITS[operation];

  const minute = Math.floor(nowMs / 60000);

  const partitionKey =
    `pv-request-v1-${operation}-${minute}`;

  const rowKey = "budget";

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt++
  ) {
    let row;

    try {
      row = await table.getEntity<{
        version: number;
        count: number;
      }>(partitionKey, rowKey);
    } catch (error) {
      if (!statusIs(error, 404)) {
        return "unavailable";
      }

      try {
        await table.createEntity({
          partitionKey,
          rowKey,
          version: 1,
          count: 1
        });

        return "reserved";
      } catch (createError) {
        if (statusIs(createError, 409)) {
          continue;
        }

        return "unavailable";
      }
    }

    if (
      row.partitionKey !== partitionKey ||
      row.rowKey !== rowKey ||
      row.version !== 1 ||
      !Number.isSafeInteger(row.count) ||
      row.count < 1 ||
      row.count > capacity ||
      typeof row.etag !== "string" ||
      row.etag.trim().length === 0 ||
      row.etag.trim() === "*"
    ) {
      return "unavailable";
    }

    if (row.count === capacity) {
      return "capacity_exhausted";
    }

    try {
      await table.updateEntity(
        {
          partitionKey,
          rowKey,
          version: 1,
          count: row.count + 1
        },
        "Replace",
        { etag: row.etag }
      );

      return "reserved";
    } catch (error) {
      if (statusIs(error, 412)) {
        continue;
      }

      // A timeout or uncertain storage result
      // must not allow additional processing.
      return "unavailable";
    }
  }

  // Bounded contention retries. Never grant a
  // request merely because storage is busy.
  return "unavailable";
}
