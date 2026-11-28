import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";
import { getTableClient } from "../_shared/tableClient";
import { discoverPermanentVisitRecovery, type PermanentVisitRecoveryDiscovery } from "../../services/visitors/discoverPermanentVisitRecovery";

type Input = Parameters<typeof discoverPermanentVisitRecovery>[0];
type Dependencies = {
  readStaff?: Parameters<typeof requireAdminStaffActorForFunction>[1];
  discover?: (input: Input) => Promise<PermanentVisitRecoveryDiscovery>;
};
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SERVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Read only; credentials and actor remain server controlled. */
export async function getPermanentVisitRecoveryDiscovery(context: any, req: any, deps: Dependencies = {}): Promise<void> {
  const reply = (status: number, body: Record<string, unknown>) => {
    context.res = { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }, body };
  };
  const unavailable = () => reply(503, { ok: false, error: "RECOVERY_DISCOVERY_UNAVAILABLE" });
  if (process.env.FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION !== "true") {
    reply(404, { ok: false, error: "NOT_FOUND" }); return;
  }
  try {
    const adminKey = (process.env.HOPE_ADMIN_API_KEY ?? "").trim();
    if (adminKey && [process.env.HOPE_API_KEY, process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY].some(key => key?.trim() === adminKey)) { unavailable(); return; }
    const auth = await requireAdminStaffActorForFunction(req, deps.readStaff);
    if (!auth.ok) { reply(auth.status, { ok: false, error: "RECOVERY_ADMIN_AUTHORIZATION_REQUIRED" }); return; }
    if (String(req?.method ?? "").toUpperCase() !== "GET") { reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" }); return; }
    const visitDate: unknown = req?.query?.visitDate;
    const cursor: unknown = req?.query?.cursor;
    if (!validDate(visitDate) || (cursor !== undefined && (typeof cursor !== "string" || !UUID4.test(cursor)))) {
      reply(400, { ok: false, error: "INVALID_RECOVERY_QUERY" }); return;
    }
    const input: Input = { visitDate, ...(typeof cursor === "string" ? { cursor } : {}), limit: 20 };
    const result = await (deps.discover ?? (value => discoverPermanentVisitRecovery(value, getTableClient("Visitors"))))(input);
    if (result.status !== "ready" || result.visitDate !== visitDate || !Number.isSafeInteger(result.scanned) || result.scanned < 0 || result.scanned > 20 ||
        !Array.isArray(result.items) || result.items.length > result.scanned ||
        (result.nextCursor !== null && (typeof result.nextCursor !== "string" || !UUID4.test(result.nextCursor) || result.nextCursor <= (input.cursor ?? "") || result.scanned !== 20))) {
      unavailable(); return;
    }
    const items: Record<string, unknown>[] = [];
    let previous = input.cursor ?? "";
    for (const entry of result.items) {
      if (!entry || typeof entry.submissionId !== "string" || !UUID4.test(entry.submissionId) || entry.submissionId <= previous ||
          (result.nextCursor !== null && entry.submissionId > result.nextCursor)) { unavailable(); return; }
      previous = entry.submissionId;
      if (entry.status === "unavailable") { items.push({ status: "unavailable", submissionId: entry.submissionId }); continue; }
      if (entry.status !== "ready" || entry.visitDate !== visitDate || typeof entry.serviceId !== "string" || !SERVICE_ID.test(entry.serviceId) ||
          !["awaiting_arrival_claim", "adult_attendance_unconfirmed", "family_attendance_unconfirmed", "completion_unconfirmed"].includes(entry.stage) ||
          [entry.familyExpected, entry.followupExpected, entry.adultRecorded, entry.familyRecorded].some(value => typeof value !== "boolean") ||
          (entry.familyRecorded && (!entry.familyExpected || !entry.adultRecorded)) ||
          ((entry.stage === "awaiting_arrival_claim" || entry.stage === "adult_attendance_unconfirmed") && entry.adultRecorded) ||
          (entry.stage === "family_attendance_unconfirmed" && (!entry.adultRecorded || !entry.familyExpected || entry.familyRecorded)) ||
          (entry.stage === "completion_unconfirmed" && (!entry.adultRecorded || entry.familyExpected !== entry.familyRecorded))) { unavailable(); return; }
      items.push({ status: "ready", submissionId: entry.submissionId, serviceId: entry.serviceId, visitDate,
        stage: entry.stage, familyExpected: entry.familyExpected, followupExpected: entry.followupExpected,
        adultRecorded: entry.adultRecorded, familyRecorded: entry.familyRecorded });
    }
    reply(200, { ok: true, discovery: { status: "ready", visitDate, scanned: result.scanned, items, nextCursor: result.nextCursor } });
  } catch { unavailable(); }
}
