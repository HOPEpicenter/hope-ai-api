import type { TableClient } from "@azure/data-tables";

export const QUOTA_RETENTION_MINUTES = 7 * 24 * 60;

export type QuotaCleanupTable = Pick<
  TableClient, "listEntities" | "deleteEntity"
>;

export type QuotaCleanupResult = {
  status:
    | "ineligible"
    | "planned"
    | "cleaned"
    | "unavailable";
  eligible: number;
  deleted: number;
};

type Candidate = {
  partitionKey: string;
  rowKey: string;
  etag: string;
};

const ALLOWED_METADATA = new Set([
  "partitionKey",
  "rowKey",
  "etag",
  "timestamp",
  "odata.metadata",
  "version"
]);

/**
 * Maintenance boundary for the dedicated
 * PermanentVisitorSessionQuota table only.
 *
 * Processes one explicitly supplied expired minute.
 * Never discovers or deletes visitor admission rows.
 * Dry-run is the default. No automatic provisioning.
 *
 * The future runtime must bind this service to the
 * dedicated quota table and a trusted server clock.
 */
export async function cleanupPermanentPublicVisitQuotaMinute(
  table: QuotaCleanupTable,
  minute: number,
  nowMs: number,
  execute = false
): Promise<QuotaCleanupResult> {
  const unavailable = (
    eligible = 0,
    deleted = 0
  ): QuotaCleanupResult => ({
    status: "unavailable", eligible, deleted
  });

  if (
    !Number.isSafeInteger(minute) ||
    minute < 0 ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    minute >=
      Math.floor(nowMs / 60000) -
      QUOTA_RETENTION_MINUTES
  ) {
    return {
      status: "ineligible",
      eligible: 0,
      deleted: 0
    };
  }

  const partitions = [
    {
      key: `pv-session-v1-${minute}`,
      capacity: 60,
      counter: false
    },
    {
      key: `pv-request-v1-session-${minute}`,
      capacity: 120,
      counter: true
    },
    {
      key: `pv-request-v1-registration-${minute}`,
      capacity: 180,
      counter: true
    }
  ];

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  try {
    // Validate the complete bounded selection
    // before performing any deletion.
    for (const partition of partitions) {
      let count = 0;

      const rows = table.listEntities<{
        version?: number;
        count?: number;
      }>({
        queryOptions: {
          filter: `PartitionKey eq '${partition.key}'`
        }
      });

      for await (const row of rows) {
        count++;

        if (
          count > (partition.counter ? 1 : 60) ||
          row.partitionKey !== partition.key ||
          row.version !== 1 ||
          typeof row.rowKey !== "string" ||
          typeof row.etag !== "string" ||
          row.etag.trim().length === 0 ||
          row.etag.trim() === "*" ||
          /[\u0000-\u001f\u007f]/.test(row.etag)
        ) {
          return unavailable();
        }

        if (!Object.keys(row).every(key =>
          ALLOWED_METADATA.has(key) ||
          (partition.counter && key === "count")
        )) {
          return unavailable();
        }

        if (partition.counter) {
          if (
            row.rowKey !== "budget" ||
            typeof row.count !== "number" ||
            !Number.isSafeInteger(row.count) ||
            row.count < 1 ||
            row.count > partition.capacity
          ) {
            return unavailable();
          }
        } else {
          if (
            !/^slot-\d{3}$/.test(row.rowKey) ||
            Number(row.rowKey.slice(5)) >= 60
          ) {
            return unavailable();
          }
        }

        const identity =
          `${row.partitionKey}/${row.rowKey}`;

        if (seen.has(identity)) {
          return unavailable();
        }

        seen.add(identity);

        candidates.push({
          partitionKey: row.partitionKey,
          rowKey: row.rowKey,
          etag: row.etag
        });
      }
    }
  } catch {
    return unavailable();
  }

  if (execute !== true) {
    return {
      status: "planned",
      eligible: candidates.length,
      deleted: 0
    };
  }

  let deleted = 0;

  for (const candidate of candidates) {
    try {
      // A concurrent change must never be deleted
      // using a wildcard or stale storage version.
      await table.deleteEntity(
        candidate.partitionKey,
        candidate.rowKey,
        { etag: candidate.etag }
      );

      deleted++;
    } catch {
      // Stop on the first uncertain result.
      // Only acknowledged deletions are counted.
      return unavailable(candidates.length, deleted);
    }
  }

  return {
    status: "cleaned",
    eligible: candidates.length,
    deleted
  };
}
