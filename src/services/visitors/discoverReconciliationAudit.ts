import type { TableClient } from "@azure/data-tables";
import type { ReconciliationOutcome } from "./executeAuditedVisitReconciliation";

type ReadTable = Pick<TableClient, "listEntities">;
const INTENT = "PUBLIC_VISIT_ADMIN_RECONCILIATION_INTENT";
const OUTCOME = "PUBLIC_VISIT_ADMIN_RECONCILIATION_OUTCOME";
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const outcomes = new Set<unknown>(["completed", "already_completed", "requires_review", "unavailable"]);
const fields = new Set(["partitionKey", "rowKey", "timestamp", "etag", "odata.metadata", "version", "actorId", "submissionId", "recordedAt", "operation"]);
type Evidence = { operationId: string; actorId: string; submissionId: string; recordedAt: string };
type Item = Evidence & ({ status: "outcome_unconfirmed" } | { status: "outcome_recorded"; outcome: ReconciliationOutcome; outcomeRecordedAt: string });
export type ReconciliationAuditReview = { status: "invalid" | "unavailable" } | { status: "ready"; utcDate: string; scanned: number; items: Item[]; nextCursor: string | null };
function iso(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && d.toISOString() === value;
}
function readEvidence(row: Record<string, unknown>, partition: string): Evidence | null {
  if (row.partitionKey !== partition || typeof row.rowKey !== "string" || !UUID4.test(row.rowKey) ||
      row.version !== 1 || row.operation !== "reconcile_saved_attendance" ||
      typeof row.actorId !== "string" || !ACTOR.test(row.actorId) ||
      typeof row.submissionId !== "string" || !UUID4.test(row.submissionId) || !iso(row.recordedAt) ||
      Object.keys(row).some(k => !fields.has(k) && !(partition === OUTCOME && k === "outcome"))) return null;
  return { operationId: row.rowKey, actorId: row.actorId, submissionId: row.submissionId, recordedAt: row.recordedAt };
}
/** Audit intent date is UTC, not attendance date. Missing outcome is not proof of failure.
 * Page by scanned intent IDs, not outcome status; no snapshot or execution authority. */
export async function discoverReconciliationAudit(input: { utcDate: string; cursor?: string; limit?: number }, table: ReadTable): Promise<ReconciliationAuditReview> {
  const { utcDate, cursor, limit = 20 } = input;
  if (typeof utcDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(utcDate) || !iso(utcDate + "T00:00:00.000Z") ||
      (cursor !== undefined && (typeof cursor !== "string" || !UUID4.test(cursor))) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 20) return { status: "invalid" };
  try {
    const start = utcDate + "T00:00:00.000Z";
    const end = utcDate + "T23:59:59.999Z";
    const filter = `PartitionKey eq '${INTENT}' and recordedAt ge '${start}' and recordedAt le '${end}'` + (cursor ? ` and RowKey gt '${cursor}'` : "");
    const found: Evidence[] = [];
    let previous = cursor ?? "";
    for await (const row of table.listEntities({ queryOptions: { filter } })) {
      const e = readEvidence(row, INTENT);
      if (!e || e.recordedAt < start || e.recordedAt > end || e.operationId <= previous) return { status: "unavailable" };
      previous = e.operationId; found.push(e);
      if (found.length > limit) break;
    }
    const items: Item[] = [];
    const page = found.slice(0, limit);
    for (const e of page) {
      let matched = false;
      for await (const row of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${OUTCOME}' and RowKey eq '${e.operationId}'` } })) {
        const result = readEvidence(row, OUTCOME);
        if (matched || !result || result.operationId !== e.operationId || result.actorId !== e.actorId || result.submissionId !== e.submissionId || result.recordedAt < e.recordedAt || !outcomes.has(row.outcome)) return { status: "unavailable" };
        matched = true;
        items.push({ ...e, status: "outcome_recorded", outcome: row.outcome as ReconciliationOutcome, outcomeRecordedAt: result.recordedAt });
      }
      if (!matched) items.push({ ...e, status: "outcome_unconfirmed" });
    }
    return { status: "ready", utcDate, scanned: page.length, items, nextCursor: found.length > limit ? page[page.length-1].operationId : null };
  } catch { return { status: "unavailable" }; }
}
