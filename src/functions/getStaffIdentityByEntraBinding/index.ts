import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  readCanonicalStaffIdentityByEntraBinding
} from "../../services/staff/readCanonicalStaffDirectory";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function getStaffIdentityByEntraBinding(
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
          authRejectedBy: "getStaffIdentityByEntraBinding"
        }
      };
      return;
    }

    const entraTenantId = String(
      req?.params?.entraTenantId ?? ""
    ).trim();
    const entraObjectId = String(
      req?.params?.entraObjectId ?? ""
    ).trim();

    const item = await readCanonicalStaffIdentityByEntraBinding(
      entraTenantId,
      entraObjectId
    );

    if (!item) {
      context.res = {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ok: false,
          requestId,
          error: "Canonical Staff Identity not found"
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
        item
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getStaffIdentityByEntraBinding", err, {
      requestId
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "GET_STAFF_IDENTITY_BY_ENTRA_BINDING_FAILED",
        "Unexpected Staff Identity lookup error",
        requestId
      )
    };
  }
}
