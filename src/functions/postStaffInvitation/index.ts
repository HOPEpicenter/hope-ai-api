import { getFeatureFlags } from "../../config/featureFlags";
import {
  createStaffInvitation
} from "../../services/staff/createStaffInvitation";
import {
  inviteMicrosoftGraphStaffMember
} from "../../services/staff/microsoftGraphStaffInvitation";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

export async function postStaffInvitation(
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
          authRejectedBy: "postStaffInvitation"
        }
      };
      return;
    }

    if (!getFeatureFlags().staffInvitations) {
      context.res = {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ok: false,
          requestId,
          error: "Staff invitations are not enabled"
        }
      };
      return;
    }

    const body = req?.body ?? {};
    const result = await createStaffInvitation(
      {
        displayName: body.displayName,
        email: body.email,
        roleLabel: body.roleLabel,
        actorId: auth.actorId
      },
      {
        sendInvitation: inviteMicrosoftGraphStaffMember
      }
    );

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
    logFunctionError(context, "postStaffInvitation", err, {
      requestId,
      actorId: null
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "STAFF_INVITATION_FAILED",
        "Staff invitation could not be completed",
        requestId
      )
    };
  }
}
