import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";

export type ReconciliationAuditTable = Pick<TableClient, "createEntity" | "getEntity">;
export type ReconciliationOutcome = "completed" | "already_completed" | "requires_review" | "unavailable";
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INTENT = "PUBLIC_VISIT_ADMIN_RECONCILIATION_INTENT";
const OUTCOME = "PUBLIC_VISIT_ADMIN_RECONCILIATION_OUTCOME";
type Evidence = { partitionKey: string; rowKey: string; version: number; actorId: string; submissionId: string; recordedAt: string; operation: string; outcome?: ReconciliationOutcome };

async function appendVerified(table: ReconciliationAuditTable, row: Evidence): Promise<boolean> {
  try {
    await table.createEntity(row);
    const stored = await table.getEntity<Evidence>(row.partitionKey, row.rowKey);
    return Object.entries(row).every(([key, value]) => stored[key as keyof Evidence] === value);
  } catch { return false; }
}

/** A fresh operation ID for each authorized attempt, including exact replays.
 * Intent must be durably verified before execution. No intent is interpreted as success.
 * No contact data, request body, token or exception is persisted. */
export async function executeAuditedVisitReconciliation(
  table: ReconciliationAuditTable, actorId: string, submissionId: string,
  reconcile: () => Promise<unknown>
): Promise<ReconciliationOutcome> {
  if (!UUID4.test(submissionId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actorId)) return "unavailable";
  const common = { rowKey: randomUUID(), version: 1, actorId, submissionId, operation: "reconcile_saved_attendance" };
  if (!await appendVerified(table, { ...common, partitionKey: INTENT, recordedAt: new Date().toISOString() })) return "unavailable";
  let outcome: ReconciliationOutcome = "unavailable";
  try {
    const value = await reconcile();
    if (value === "completed" || value === "already_completed" || value === "requires_review") outcome = value;
  } catch { /* Record unconfirmed execution, never raw exception details. */ }
  if (!await appendVerified(table, { ...common, partitionKey: OUTCOME, recordedAt: new Date().toISOString(), outcome })) return "unavailable";
  return outcome;
}
