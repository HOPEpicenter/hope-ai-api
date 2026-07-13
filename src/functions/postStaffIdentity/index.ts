import {
  createStaffIdentity
} from "../../services/staff/staffCommands";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminApiKeyForFunction
} from "../_shared/adminApiKey";

export async function postStaffIdentity(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireAdminApiKeyForFunction(req);

    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ...auth.body,
          requestId,
          authRejectedBy: "postStaffIdentity"
        }
      };
      return;
    }

    const body = req?.body ?? {};

    const result = await createStaffIdentity({
      displayName: body.displayName,
      roleLabel: body.roleLabel,
      actorId: body.actorId
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
    logFunctionError(context, "postStaffIdentity", err, {
      requestId,
      actorId: req?.body?.actorId ?? null
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "STAFF_IDENTITY_CREATE_FAILED",
        err?.message ?? "Staff identity creation failed",
        requestId
      )
    };
  }
}
