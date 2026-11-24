import type { TableClient } from "@azure/data-tables";
import { inspectPermanentVisitRecovery, type PermanentVisitRecoveryInspection } from "./inspectPermanentVisitRecovery";
import { isVisitorCheckInRequest } from "./recordVisitorCheckIn";

type ReadTable = Pick<TableClient, "listEntities">;
type Ready = Extract<PermanentVisitRecoveryInspection, { status: "ready" }>;
type Item = Ready | { status: "unavailable"; submissionId: string };
export type PermanentVisitRecoveryDiscovery =
  | { status: "invalid" | "unavailable" }
  | { status: "ready"; visitDate: string; scanned: number; items: Item[]; nextCursor: string | null };

const INTENT = "PUBLIC_VISIT_RECOVERY_INTENT";
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Read-only internal discovery, not a repair or admission boundary.
 * Cursor advances by scanned intent rows, not returned unresolved items.
 * A page with no items can still have a next cursor. Not a snapshot.
 */
export async function discoverPermanentVisitRecovery(
  input: { visitDate: string; cursor?: string; limit?: number }, table: ReadTable
): Promise<PermanentVisitRecoveryDiscovery> {
  const { visitDate, cursor, limit = 20 } = input;
  if (!validDate(visitDate) || (cursor !== undefined && !isVisitorCheckInRequest(cursor, "recovery")) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 20) return { status: "invalid" };
  try {
    const filter = `PartitionKey eq '${INTENT}' and visitDate eq '${visitDate}'` +
      (cursor === undefined ? "" : ` and RowKey gt '${cursor}'`);
    const rows: string[] = [];
    let previous = cursor ?? "";
    for await (const row of table.listEntities<{ submissionId: string; visitDate: string }>({ queryOptions: {
      filter, select: ["PartitionKey", "RowKey", "submissionId", "visitDate"]
    } })) {
      if (row.partitionKey !== INTENT || typeof row.rowKey !== "string" ||
          !isVisitorCheckInRequest(row.rowKey, "recovery") || row.rowKey <= previous ||
          row.submissionId !== row.rowKey || row.visitDate !== visitDate) return { status: "unavailable" };
      previous = row.rowKey;
      rows.push(row.rowKey);
      if (rows.length > limit) break;
    }
    const hasMore = rows.length > limit;
    const scanned = rows.slice(0, limit);
    const items: Item[] = [];
    for (const submissionId of scanned) {
      const state = await inspectPermanentVisitRecovery(submissionId, table);
      if (state.status !== "ready" || state.submissionId !== submissionId || state.visitDate !== visitDate) {
        items.push({ status: "unavailable", submissionId });
      } else if (state.stage !== "completed") {
        items.push(state);
      }
    }
    return { status: "ready", visitDate, scanned: scanned.length, items,
      nextCursor: hasMore ? scanned[scanned.length - 1] : null };
  } catch { return { status: "unavailable" }; }
}
