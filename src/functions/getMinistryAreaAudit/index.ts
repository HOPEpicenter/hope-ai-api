import { readMinistryAreaAudit } from "../../services/ministryAreas/ministryAreaCommands";
import { apiErrorBody, getRequestId, logFunctionError } from "../../shared/observability/functionObservability";
import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";

export async function getMinistryAreaAudit(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAdminStaffActorForFunction(req);
    if (!auth.ok) {
      context.res = { status: auth.status, body: { ...auth.body, requestId } };
      return;
    }
    const ministryAreaId = String(req?.params?.ministryAreaId ?? "").trim();
    if (!ministryAreaId) {
      context.res = { status: 400, body: { ok: false, requestId, error: "ministryAreaId is required" } };
      return;
    }
    const items = await readMinistryAreaAudit(ministryAreaId);
    context.res = items.length
      ? { status: 200, body: { ok: true, requestId, ministryAreaId, count: items.length, items } }
      : { status: 404, body: { ok: false, requestId, error: "Ministry Area audit history not found" } };
  } catch (error: any) {
    logFunctionError(context, "getMinistryAreaAudit", error, { requestId });
    context.res = { status: 500, body: apiErrorBody(
      "GET_MINISTRY_AREA_AUDIT_FAILED", "Unexpected Ministry Area audit error", requestId
    ) };
  }
}
