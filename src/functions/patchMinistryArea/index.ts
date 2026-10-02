import { updateMinistryArea } from "../../services/ministryAreas/ministryAreaCommands";
import { apiErrorBody, getRequestId, logFunctionError } from "../../shared/observability/functionObservability";
import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";

export async function patchMinistryArea(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAdminStaffActorForFunction(req);
    if (!auth.ok) {
      context.res = { status: auth.status, body: { ...auth.body, requestId } };
      return;
    }
    const body = req?.body ?? {};
    const result = await updateMinistryArea({
      commandId: body.commandId,
      ministryAreaId: req?.params?.ministryAreaId,
      displayName: body.displayName,
      status: body.status,
      leaderStaffId: body.leaderStaffId,
      leaderStaffIds: body.leaderStaffIds,
      reason: body.reason,
      actorId: auth.actorId
    });
    context.res = result.accepted
      ? { status: 202, body: { ok: true, requestId, ...result } }
      : { status: result.status, body: { ok: false, requestId, error: result.error } };
  } catch (error: any) {
    logFunctionError(context, "patchMinistryArea", error, { requestId });
    context.res = { status: 500, body: apiErrorBody(
      "MINISTRY_AREA_UPDATE_FAILED", "Unexpected Ministry Area update error", requestId
    ) };
  }
}
