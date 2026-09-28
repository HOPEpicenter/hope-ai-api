import { readMinistryAreas } from "../../services/ministryAreas/ministryAreaCommands";
import { apiErrorBody, getRequestId, logFunctionError } from "../../shared/observability/functionObservability";
import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";

export async function getMinistryAreas(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAdminStaffActorForFunction(req);
    if (!auth.ok) {
      context.res = { status: auth.status, body: { ...auth.body, requestId } };
      return;
    }
    const items = await readMinistryAreas();
    context.res = { status: 200, body: { ok: true, requestId, count: items.length, items } };
  } catch (error: any) {
    logFunctionError(context, "getMinistryAreas", error, { requestId });
    context.res = { status: 500, body: apiErrorBody(
      "GET_MINISTRY_AREAS_FAILED", "Unexpected Ministry Area directory error", requestId
    ) };
  }
}
