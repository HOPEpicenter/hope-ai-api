import { createMinistryArea } from "../../services/ministryAreas/ministryAreaCommands";
import { apiErrorBody, getRequestId, logFunctionError } from "../../shared/observability/functionObservability";
import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";

export async function postMinistryArea(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);
  try {
    const auth = await requireAdminStaffActorForFunction(req);
    if (!auth.ok) {
      context.res = { status: auth.status, body: { ...auth.body, requestId } };
      return;
    }
    const body = req?.body ?? {};
    const result = await createMinistryArea({
      commandId: body.commandId,
      displayName: body.displayName,
      actorId: auth.actorId
    });
    context.res = result.accepted
      ? { status: 202, body: { ok: true, requestId, ...result } }
      : { status: result.status, body: { ok: false, requestId, error: result.error } };
  } catch (error: any) {
    logFunctionError(context, "postMinistryArea", error, { requestId });
    context.res = { status: 500, body: apiErrorBody(
      "MINISTRY_AREA_CREATE_FAILED", "Unexpected Ministry Area create error", requestId
    ) };
  }
}
