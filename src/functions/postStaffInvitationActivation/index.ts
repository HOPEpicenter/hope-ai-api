import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  activateStaffInvitation
} from "../../services/staff/activateStaffInvitation";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postStaffInvitationActivation(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);

    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ...auth.body,
          requestId,
          authRejectedBy: "postStaffInvitationActivation"
        }
      };
      return;
    }

    const result = await activateStaffInvitation({
      entraTenantId: String(req?.params?.entraTenantId ?? "").trim(),
      entraObjectId: String(req?.params?.entraObjectId ?? "").trim()
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
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: {
        ok: true,
        requestId,
        staffId: result.staffId,
        activated: result.activated,
        eventId: result.eventId
      }
    };
  } catch (err: any) {
    logFunctionError(context, "postStaffInvitationActivation", err, {
      requestId
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "STAFF_INVITATION_ACTIVATION_FAILED",
        "Staff invitation activation could not be completed",
        requestId
      )
    };
  }
}
