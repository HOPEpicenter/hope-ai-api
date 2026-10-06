import {
  requestMinistryEmailDelivery
} from "../../services/communications/requestMinistryEmailDelivery";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export type PostMinistryEmailDeliveryRequestDependencies = {
  authorize?: typeof requireAdminStaffActorForFunction;
  requestDelivery?: typeof requestMinistryEmailDelivery;
};

function safeErrorCode(
  status: number,
  error: string
): string {
  if (status === 400) {
    return "INVALID_MINISTRY_EMAIL_DELIVERY_REQUEST";
  }

  if (/^[A-Z0-9_]+$/.test(error)) {
    return error;
  }

  return "MINISTRY_EMAIL_DELIVERY_REQUEST_REJECTED";
}

function failureMessage(
  status: number
): string {
  if (status === 400) {
    return "Invalid ministry email delivery request";
  }

  if (status === 403) {
    return "Ministry email delivery request is not authorized";
  }

  if (status === 404) {
    return "Required ministry email delivery source was not found";
  }

  if (status === 409) {
    return "Ministry email delivery request conflicts with canonical state";
  }

  if (status === 503) {
    return "Ministry email delivery requests are unavailable";
  }

  return "Ministry email delivery request failed";
}

export async function postMinistryEmailDeliveryRequest(
  context: any,
  req: any,
  dependencies:
    PostMinistryEmailDeliveryRequestDependencies = {}
): Promise<void> {
  const requestId =
    getRequestId(req);

  try {
    const authorize =
      dependencies.authorize ??
      requireAdminStaffActorForFunction;

    const auth =
      await authorize(req);

    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: jsonHeaders,
        body: {
          ...auth.body,
          requestId
        }
      };
      return;
    }

    const body =
      req?.body ?? {};

    const requestDelivery =
      dependencies.requestDelivery ??
      requestMinistryEmailDelivery;

    const result =
      await requestDelivery({
        visitorId:
          body.visitorId,
        actorId:
          auth.actorId,
        deliveryId:
          body.deliveryId,
        communicationId:
          body.communicationId,
        subject:
          body.subject,
        body:
          body.body
      });

    if (result.accepted) {
      context.res = {
        status:
          result.status,
        headers:
          jsonHeaders,
        body: {
          ok: true,
          requestId,
          created:
            result.created,
          delivery:
            result.delivery
        }
      };
      return;
    }

    context.res = {
      status:
        result.status,
      headers:
        jsonHeaders,
      body:
        apiErrorBody(
          safeErrorCode(
            result.status,
            result.error
          ),
          failureMessage(
            result.status
          ),
          requestId
        )
    };
  }
  catch (error: any) {
    logFunctionError(
      context,
      "postMinistryEmailDeliveryRequest",
      error,
      {
        requestId
      }
    );

    context.res = {
      status: 500,
      headers: jsonHeaders,
      body:
        apiErrorBody(
          "MINISTRY_EMAIL_DELIVERY_REQUEST_FAILED",
          "Unexpected ministry email delivery request error",
          requestId
        )
    };
  }
}