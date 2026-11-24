import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";
import { getTableClient } from "../_shared/tableClient";
import { SixWeekFollowupEventsRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import { reconcilePermanentVisitCompletion } from "../../services/visitors/reconcilePermanentVisitCompletion";

import { executeAuditedVisitReconciliation, type ReconciliationAuditTable } from "../../services/visitors/executeAuditedVisitReconciliation";

type Dependencies = {
  auditTable?: ReconciliationAuditTable;
  readStaff?: Parameters<typeof requireAdminStaffActorForFunction>[1];
  reconcile?: (submissionId: string) => ReturnType<typeof reconcilePermanentVisitCompletion>;
};
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Explicit administrator execution only. No attendance creation, index release or visitor contact. */
export async function postPermanentVisitReconciliation(context: any, req: any, deps: Dependencies = {}): Promise<void> {
  const reply = (status: number, body: Record<string, unknown>) => {
    context.res = { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }, body };
  };
  const unavailable = () => reply(503, { ok: false, error: "RECOVERY_RECONCILIATION_UNAVAILABLE" });
  if (process.env.FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION !== "true" ||
      process.env.FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION !== "true") {
    reply(404, { ok: false, error: "NOT_FOUND" }); return;
  }
  if (process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD !== "true" ||
      process.env.FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP !== "true") { unavailable(); return; }
  try {
    const adminKey = (process.env.HOPE_ADMIN_API_KEY ?? "").trim();
    if (adminKey && [process.env.HOPE_API_KEY, process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY,
        process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET, process.env.HOPE_PERMANENT_VISIT_CLAIM_SECRET].some(key => key?.trim() === adminKey)) {
      unavailable(); return;
    }
    const auth = await requireAdminStaffActorForFunction(req, deps.readStaff);
    if (!auth.ok) { reply(auth.status, { ok: false, error: "RECOVERY_ADMIN_AUTHORIZATION_REQUIRED" }); return; }
    if (req?.method !== "POST") { reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" }); return; }
    const submissionId: unknown = req?.params?.submissionId;
    const body: unknown = req?.body;
    if (typeof submissionId !== "string" || !UUID4.test(submissionId) || !body ||
        typeof body !== "object" || Object.getPrototypeOf(body) !== Object.prototype ||
        Object.keys(body).length !== 2 ||
        !Object.prototype.hasOwnProperty.call(body, "submissionId") ||
        !Object.prototype.hasOwnProperty.call(body, "confirmation") ||
        (body as Record<string, unknown>).submissionId !== submissionId ||
        (body as Record<string, unknown>).confirmation !== "reconcile_saved_attendance") {
      reply(400, { ok: false, error: "EXACT_RECONCILIATION_CONFIRMATION_REQUIRED" }); return;
    }
    const result = await executeAuditedVisitReconciliation(
      deps.auditTable ?? getTableClient("Visitors"), auth.actorId, submissionId,
      () => (deps.reconcile ?? (id => reconcilePermanentVisitCompletion(id, {
        enabled: true, visitors: getTableClient("Visitors"), repository: new SixWeekFollowupEventsRepository()
      })))(submissionId));
    if (result === "completed" || result === "already_completed") {
      reply(200, { ok: true, submissionId, status: result }); return;
    }
    if (result === "requires_review") { reply(409, { ok: false, error: "RECOVERY_REQUIRES_REVIEW" }); return; }
    unavailable();
  } catch { unavailable(); }
}
