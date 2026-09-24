import { requireAdminStaffActorForFunction } from "../_shared/adminStaffActor";
import { CorrectionReplayUnavailableError } from "../_shared/formation";
import {
  CorrectionCommandError,
  recordNextStepCompletionCorrection
} from "../../services/formation/recordNextStepCompletionCorrection";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postNextStepCompletionCorrection(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);
  if (process.env.FEATURE_NEXT_STEP_COMPLETION_CORRECTIONS !== "true") {
    context.res = {
      status: 404,
      body: apiErrorBody("CORRECTIONS_DISABLED", "Correction command is unavailable", requestId)
    };
    return;
  }

  try {
    const auth = await requireAdminStaffActorForFunction(req);
    if (!auth.ok) {
      context.res = { status: auth.status, body: { ...auth.body, requestId } };
      return;
    }

    const body = req?.body ?? {};
    const result = await recordNextStepCompletionCorrection({
      visitorId: body.visitorId,
      eventId: body.eventId,
      targetEventIds: body.targetEventIds,
      reason: body.reason,
      actorId: auth.actorId
    });
    context.res = {
      status: result.accepted ? 201 : 200,
      body: { ok: true, requestId, ...result }
    };
  } catch (error: any) {
    const status = error instanceof CorrectionReplayUnavailableError
      ? 503
      : error instanceof CorrectionCommandError
        ? error.statusCode
        : 500;
    const code = error instanceof CorrectionReplayUnavailableError
      ? error.code
      : error instanceof CorrectionCommandError
        ? error.code
        : "CORRECTION_INTERNAL_ERROR";
    logFunctionError(context, "postNextStepCompletionCorrection", error, {
      requestId,
      status
    });
    context.res = {
      status,
      body: apiErrorBody(
        code,
        status >= 500 ? "Correction could not be completed" : String(error.message),
        requestId
      )
    };
  }
}
