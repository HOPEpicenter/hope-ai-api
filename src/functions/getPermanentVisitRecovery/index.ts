import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";
import { getTableClient } from "../_shared/tableClient";
import { inspectPermanentVisitRecovery, type PermanentVisitRecoveryInspection } from "../../services/visitors/inspectPermanentVisitRecovery";

type Dependencies = {
  readStaff?: Parameters<typeof requireAdminStaffActorForFunction>[1];
  inspect?: (submissionId: string) => Promise<PermanentVisitRecoveryInspection>;
};
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SERVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STAGES = new Set(["awaiting_arrival_claim", "adult_attendance_unconfirmed", "family_attendance_unconfirmed", "completion_unconfirmed", "completed"]);

/** Read-only administrator boundary. No repair authority or visitor data disclosure. */
export async function getPermanentVisitRecovery(context: any, req: any, deps: Dependencies = {}): Promise<void> {
  const reply = (status: number, body: Record<string, unknown>) => {
    context.res = { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }, body };
  };
  const unavailable = () => reply(503, { ok: false, error: "RECOVERY_INSPECTION_UNAVAILABLE" });
  if (process.env.FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION !== "true") {
    reply(404, { ok: false, error: "NOT_FOUND" }); return;
  }
  try {
    const adminKey = (process.env.HOPE_ADMIN_API_KEY ?? "").trim();
    // Do not permit an ordinary staff or public bridge credential to be
    // repurposed as the administrator credential by configuration accident.
    if (adminKey && [process.env.HOPE_API_KEY, process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY].some(key => key?.trim() === adminKey)) {
      unavailable(); return;
    }
    const auth = await requireAdminStaffActorForFunction(req, deps.readStaff);
    if (!auth.ok) { reply(auth.status, { ok: false, error: "RECOVERY_ADMIN_AUTHORIZATION_REQUIRED" }); return; }
    if (String(req?.method ?? "").toUpperCase() !== "GET") { reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" }); return; }
    const submissionId: unknown = req?.params?.submissionId;
    if (typeof submissionId !== "string" || !UUID4.test(submissionId)) { reply(400, { ok: false, error: "INVALID_SUBMISSION_ID" }); return; }
    const result = await (deps.inspect ?? (id => inspectPermanentVisitRecovery(id, getTableClient("Visitors"))))(submissionId);
    if (result.status === "not_tracked") { reply(404, { ok: false, error: "RECOVERY_NOT_TRACKED" }); return; }
    if (result.status !== "ready" || result.submissionId !== submissionId ||
        typeof result.serviceId !== "string" || !SERVICE_ID.test(result.serviceId) ||
        typeof result.visitDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(result.visitDate) ||
        !STAGES.has(result.stage) ||
        [result.familyExpected, result.followupExpected, result.adultRecorded, result.familyRecorded].some(value => typeof value !== "boolean")) {
      unavailable(); return;
    }
    const date = new Date(result.visitDate + "T00:00:00.000Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result.visitDate ||
        (result.familyRecorded && (!result.familyExpected || !result.adultRecorded)) ||
        ((result.stage === "awaiting_arrival_claim" || result.stage === "adult_attendance_unconfirmed") && result.adultRecorded) ||
        (result.stage === "family_attendance_unconfirmed" && (!result.adultRecorded || !result.familyExpected || result.familyRecorded)) ||
        ((result.stage === "completion_unconfirmed" || result.stage === "completed") && (!result.adultRecorded || result.familyExpected !== result.familyRecorded))) {
      unavailable(); return;
    }
    // Explicit projection: never spread the inspector or raw storage rows.
    reply(200, { ok: true, recovery: {
      status: "ready", submissionId, serviceId: result.serviceId, visitDate: result.visitDate,
      stage: result.stage, familyExpected: result.familyExpected, followupExpected: result.followupExpected,
      adultRecorded: result.adultRecorded, familyRecorded: result.familyRecorded
    } });
  } catch { unavailable(); }
}
