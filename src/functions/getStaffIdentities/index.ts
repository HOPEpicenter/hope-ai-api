import { requireApiKeyForFunction } from "../_shared/apiKey";
import { listKnownStaffIdentities } from "../../services/operators/operatorIdentity";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function getStaffIdentities(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);

    if (!auth.ok) {
      context.log.warn("getStaffIdentities auth rejected");

      context.res = {
        status: auth.status,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ...auth.body,
          authRejectedBy: "getStaffIdentities"
        }
      };

      return;
    }

    const items = listKnownStaffIdentities();

    context.res = {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: {
        ok: true,
        requestId,
        count: items.length,
        items
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getStaffIdentities", err, {
      requestId
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "GET_STAFF_IDENTITIES_FAILED",
        "Unexpected staff identities error",
        requestId
      )
    };
  }
}
