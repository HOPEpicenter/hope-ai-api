import {
  updateStaffIdentity
} from "../../services/staff/staffCommands";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

export async function patchStaffIdentity(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAdminStaffActorForFunction(req);

    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ...auth.body,
          requestId,
          authRejectedBy: "patchStaffIdentity"
        }
      };
      return;
    }

    const staffId = String(
      req?.params?.staffId ?? ""
    ).trim();

    const body = req?.body ?? {};

    const result = await updateStaffIdentity({
      staffId,
      displayName: body.displayName,
      roleLabel: body.roleLabel,
      status: body.status,
      reason: body.reason,
      actorId: auth.actorId,
      entraTenantId: body.entraTenantId,
      entraObjectId: body.entraObjectId
    });

    if (!result.accepted) {
      context.res = {
        status: result.status,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ok: false,
          requestId,
          error: result.error
        }
      };
      return;
    }

    context.res = {
      status: 202,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: {
        ok: true,
        requestId,
        accepted: true,
        eventId: result.eventId,
        staffId: result.staffId,
        type: result.type
      }
    };
  } catch (err: any) {
    logFunctionError(context, "patchStaffIdentity", err, {
      requestId,
      staffId: req?.params?.staffId ?? null,
      actorId: null
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "STAFF_IDENTITY_UPDATE_FAILED",
        err?.message ?? "Staff identity update failed",
        requestId
      )
    };
  }
}
