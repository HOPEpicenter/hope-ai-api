import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureFormationTables,
  recordFormationEventV1,
  toFormationHttpError
} from "../_shared/formation";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postFormationEvent(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.log.warn("postFormationEvent auth rejected");
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ...auth.body,
          authRejectedBy: "postFormationEvent"
        }
      };
      return;
    }

    await ensureFormationTables();

    const body = req?.body ?? {};
    const result = await recordFormationEventV1(body);

    context.res = {
      status: result.accepted ? 201 : 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        accepted: result.accepted,
        id: result.id,
        visitorId: result.visitorId,
        type: result.type,
        occurredAt: result.occurredAt,
        rowKey: result.rowKey,
        profile: result.profile
      }
    };
  } catch (error: any) {
    const status = toFormationHttpError(error, 400);
    const publicMessage = status >= 500
      ? "Unexpected formation event error"
      : String(error?.message || "Bad Request");

    logFunctionError(context, "postFormationEvent", error, {
      requestId,
      status,
      visitorId: req?.body?.visitorId ?? null,
      eventId: req?.body?.eventId ?? null,
      type: req?.body?.type ?? null
    });

    context.res = {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        status >= 500 ? "FORMATION_EVENT_INTERNAL_ERROR" : "FORMATION_EVENT_BAD_REQUEST",
        publicMessage,
        requestId
      )
    };
  }
}
