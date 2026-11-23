import { getTableClient } from "../../functions/_shared/tableClient";
import { getVisitorById } from "../../functions/_shared/visitorsRepository";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

const RATE_PARTITION = "VISITOR_CHECK_IN_RATE";
const MAX_PER_MINUTE = 60;
const MAX_LIST_SIZE = 250;

function statusCode(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode;
}

/** An atomic shared limit across all frontend instances. */
export async function reserveSundayCheckIn(nowMs: number): Promise<boolean> {
  const table = getTableClient("Visitors");
  await ensureTableExists(table);
  const rowKey = String(Math.floor(nowMs / 60_000));
  const key = { partitionKey: RATE_PARTITION, rowKey };
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await table.getEntity<{ count: number }>(RATE_PARTITION, rowKey)
      .catch(error => {
        if (statusCode(error) === 404) return null;
        throw error;
      });
    if (row && (!Number.isSafeInteger(row.count) || row.count < 1 || !row.etag)) {
      throw new Error("Invalid visitor check-in rate record.");
    }
    if (row && row.count >= MAX_PER_MINUTE) return false;
    try {
      if (row) {
        await table.updateEntity({ ...key, count: row.count + 1 }, "Replace", { etag: row.etag });
      } else {
        await table.createEntity({ ...key, count: 1 });
      }
      return true;
    } catch (error) {
      if (![409, 412].includes(statusCode(error) ?? 0)) throw error;
    }
  }
  return false;
}

export async function listSundayCheckIns(serviceId: string) {
  const table = getTableClient("Visitors");
  await ensureTableExists(table);
  const visits: { visitorId: string; recordedAt: string }[] = [];
  const safeService = serviceId.replace(/'/g, "''");
  for await (const row of table.listEntities<{ visitorId: string; recordedAt: string }>({
    queryOptions: {
      filter: `PartitionKey eq 'VISITOR_CHECK_IN' and serviceId eq '${safeService}'`,
      select: ["visitorId", "recordedAt"]
    }
  })) {
    visits.push({ visitorId: row.visitorId, recordedAt: row.recordedAt });
    if (visits.length > MAX_LIST_SIZE) break;
  }
  visits.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  const items: (typeof visits[number] & { name: string | null })[] = [];
  const names = new Map<string, string | null>();
  for (const visit of visits.slice(0, MAX_LIST_SIZE)) {
    if (!names.has(visit.visitorId)) {
      const visitor = await getVisitorById(visit.visitorId, {
        getTableClient: () => table,
        ensureTableExists: async () => {}
      });
      names.set(visit.visitorId, visitor?.name ?? null);
    }
    items.push({ ...visit, name: names.get(visit.visitorId) ?? null });
  }
  return { items, truncated: visits.length > MAX_LIST_SIZE };
}
