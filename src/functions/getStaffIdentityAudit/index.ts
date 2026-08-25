import {
  readStaffIdentityAudit
} from "../../services/staff/readStaffIdentityAudit";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

export async function getStaffIdentityAudit(
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
          authRejectedBy: "getStaffIdentityAudit"
        }
      };

      return;
    }

    const staffId = String(req?.params?.staffId ?? "").trim();

    if (!staffId) {
      context.res = {
        status: 400,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ok: false,
          requestId,
          error: "staffId is required"
        }
      };

      return;
    }

    const items = await readStaffIdentityAudit(staffId);

    if (items.length === 0) {
      context.res = {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ok: false,
          requestId,
          error: "Staff identity audit history not found"
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
        staffId,
        count: items.length,
        items
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getStaffIdentityAudit", err, {
      requestId,
      staffId: req?.params?.staffId ?? null
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "GET_STAFF_IDENTITY_AUDIT_FAILED",
        "Unexpected staff identity audit error",
        requestId
      )
    };
  }
}
