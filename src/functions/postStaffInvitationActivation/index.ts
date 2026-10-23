import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  getEntraStaffActivationAuthorizationConfiguration
} from "../../config/entraStaffActivationAuthorization";
import {
  authorizeStaffInvitationActivation,
  type VerifyStaffInvitationActivationToken
} from "../../services/authorization/authorizeStaffInvitationActivation";
import {
  activateStaffInvitation
} from "../../services/staff/activateStaffInvitation";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

const BEARER_PATTERN =
  /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

function parseBearerToken(req: any): string | null {
  const headers = req?.headers;
  const values: unknown[] = [];
  let directCount = 0;

  if (typeof headers?.get === "function") {
    const value = headers.get("authorization");
    if (value !== null && value !== undefined) {
      values.push(value);
    }
  }

  if (headers && typeof headers === "object") {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "authorization") {
        directCount += 1;
        values.push(headers[key]);
      }
    }
  }

  if (
    values.length === 0 ||
    directCount > 1 ||
    values.some(value => typeof value !== "string") ||
    values.some(value => value !== values[0])
  ) {
    return null;
  }

  return BEARER_PATTERN.exec(values[0] as string)?.[1] ?? null;
}

export type PostStaffInvitationActivationDependencies = {
  getAuthorizationConfiguration: typeof getEntraStaffActivationAuthorizationConfiguration;
  verifyToken?: VerifyStaffInvitationActivationToken;
  activate: typeof activateStaffInvitation;
};

export function createPostStaffInvitationActivationHandler(
  dependencies: PostStaffInvitationActivationDependencies
): (context: any, req: any) => Promise<void> {
  return (context, req) =>
    handlePostStaffInvitationActivation(context, req, dependencies);
}

export async function postStaffInvitationActivation(
  context: any,
  req: any
): Promise<void> {
  return handlePostStaffInvitationActivation(context, req, {
    getAuthorizationConfiguration:
      getEntraStaffActivationAuthorizationConfiguration,
    activate: activateStaffInvitation
  });
}

async function handlePostStaffInvitationActivation(
  context: any,
  req: any,
  dependencies: PostStaffInvitationActivationDependencies
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

    const activationAuthorization =
      dependencies.getAuthorizationConfiguration();

    if (activationAuthorization.enforcementEnabled) {
      const bearerToken = parseBearerToken(req);

      if (!bearerToken) {
        context.res = {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8"
          },
          body: {
            ok: false,
            error: "Unauthorized",
            requestId,
            authRejectedBy: "postStaffInvitationActivation"
          }
        };
        return;
      }

      const decision = await authorizeStaffInvitationActivation(
        bearerToken,
        String(req?.params?.entraTenantId ?? "").trim(),
        String(req?.params?.entraObjectId ?? "").trim(),
        activationAuthorization.verificationConfiguration,
        dependencies.verifyToken
      );

      if (!decision.allowed) {
        context.res = {
          status:
            decision.reason === "identity_mismatch" ? 403 : 401,
          headers: {
            "content-type": "application/json; charset=utf-8"
          },
          body: {
            ok: false,
            error: "Unauthorized",
            requestId,
            authRejectedBy: "postStaffInvitationActivation"
          }
        };
        return;
      }
    }

    const result = await dependencies.activate({
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
