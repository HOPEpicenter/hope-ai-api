import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";
import { getTableClient } from "../_shared/tableClient";
import { discoverReconciliationAudit, type ReconciliationAuditReview } from "../../services/visitors/discoverReconciliationAudit";

type Input = Parameters<typeof discoverReconciliationAudit>[0];
type Dependencies = {
  readStaff?: Parameters<typeof requireAdminStaffActorForFunction>[1];
  discover?: (input: Input) => Promise<ReconciliationAuditReview>;
};
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Read only; credentials and actor remain server controlled. */
export async function getPermanentVisitReconciliationAudit(context: any, req: any, deps: Dependencies = {}): Promise<void> {
  const reply = (status: number, body: Record<string, unknown>) => {
    context.res = { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }, body };
  };
  const unavailable = () => reply(503, { ok: false, error: "RECONCILIATION_AUDIT_UNAVAILABLE" });
  if (process.env.FEATURE_PERMANENT_VISIT_RECOVERY_AUDIT_REVIEW !== "true") {
    reply(404, { ok: false, error: "NOT_FOUND" }); return;
  }
  try {
    const adminKey = (process.env.HOPE_ADMIN_API_KEY ?? "").trim();
    if (adminKey && [process.env.HOPE_API_KEY, process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY, process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET, process.env.HOPE_PERMANENT_VISIT_CLAIM_SECRET].some(key => key?.trim() === adminKey)) { unavailable(); return; }
    const auth = await requireAdminStaffActorForFunction(req, deps.readStaff);
    if (!auth.ok) { reply(auth.status, { ok: false, error: "RECOVERY_ADMIN_AUTHORIZATION_REQUIRED" }); return; }
    if (String(req?.method ?? "").toUpperCase() !== "GET") { reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" }); return; }
    const utcDate: unknown = req?.query?.utcDate;
    const cursor: unknown = req?.query?.cursor;
    if (!validDate(utcDate) || (cursor !== undefined && (typeof cursor !== "string" || !UUID4.test(cursor)))) {
      reply(400, { ok: false, error: "INVALID_AUDIT_QUERY" }); return;
    }
    const input: Input = { utcDate, ...(typeof cursor === "string" ? { cursor } : {}), limit: 20 };
    const result = await (deps.discover ?? (value => discoverReconciliationAudit(value, getTableClient("Visitors"))))(input);
    if (result.status !== "ready" || result.utcDate !== utcDate || !Number.isSafeInteger(result.scanned) || result.scanned < 0 || result.scanned > 20 ||
        !Array.isArray(result.items) || result.items.length !== result.scanned ||
        (result.nextCursor !== null && (typeof result.nextCursor !== "string" || !UUID4.test(result.nextCursor) || result.scanned !== 20))) { unavailable(); return; }
    const iso = (value: unknown): value is string => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
      const d = new Date(value); return Number.isFinite(d.getTime()) && d.toISOString() === value;
    };
    const items: Record<string, unknown>[] = [];
    let previous = input.cursor ?? "";
    for (const entry of result.items) {
      if (!entry || typeof entry.operationId !== "string" || !UUID4.test(entry.operationId) || entry.operationId <= previous ||
          typeof entry.submissionId !== "string" || !UUID4.test(entry.submissionId) || typeof entry.actorId !== "string" || !ACTOR.test(entry.actorId) ||
          !iso(entry.recordedAt) || entry.recordedAt.slice(0,10) !== utcDate) { unavailable(); return; }
      previous = entry.operationId;
      const evidence = {operationId: entry.operationId, actorId: entry.actorId, submissionId: entry.submissionId, recordedAt: entry.recordedAt};
      if (entry.status === "outcome_unconfirmed") {
        if ("outcome" in entry || "outcomeRecordedAt" in entry) { unavailable(); return; }
        items.push({...evidence, status: entry.status});
      } else if (entry.status === "outcome_recorded" && ["completed", "already_completed", "requires_review", "unavailable"].includes(entry.outcome) &&
                 iso(entry.outcomeRecordedAt) && entry.outcomeRecordedAt >= entry.recordedAt) {
        items.push({...evidence, status: entry.status, outcome: entry.outcome, outcomeRecordedAt: entry.outcomeRecordedAt});
      } else { unavailable(); return; }
    }
    if (result.nextCursor !== null && result.nextCursor !== previous) { unavailable(); return; }
    reply(200, {ok: true, audit: {status: "ready", utcDate, scanned: result.scanned, items, nextCursor: result.nextCursor}});
  } catch { unavailable(); }
}
