import {
  dispatchMinistryEmailDelivery,
  type MinistryEmailDispatchResult,
  type MinistryEmailDispatchStatus
} from "../../services/communications/dispatchMinistryEmailDelivery";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError,
  logFunctionInfo
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

export type PostMinistryEmailDeliveryDispatchDependencies = {
  authorize?: typeof requireAdminStaffActorForFunction;
  dispatch?: (
    deliveryId: string
  ) => Promise<MinistryEmailDispatchResult>;
};

type FailureDescriptor = {
  status: number;
  code: string;
  message: string;
};

function failureDescriptor(
  status: MinistryEmailDispatchStatus
): FailureDescriptor | null {
  switch (status) {
    case "provider_accepted":
    case "provider_failed":
    case "already_terminal":
      return null;

    case "phase5_disabled":
    case "provider_sending_disabled":
      return {
        status: 404,
        code: "MINISTRY_EMAIL_DISPATCH_DISABLED",
        message: "Ministry email dispatch is unavailable"
      };

    case "provider_unavailable":
      return {
        status: 503,
        code: "MINISTRY_EMAIL_PROVIDER_UNAVAILABLE",
        message: "Ministry email provider is unavailable"
      };

    case "delivery_not_found":
      return {
        status: 404,
        code: "MINISTRY_EMAIL_DELIVERY_NOT_FOUND",
        message: "Ministry email delivery not found"
      };

    case "delivery_voided":
      return {
        status: 409,
        code: "MINISTRY_EMAIL_DELIVERY_VOIDED",
        message: "Ministry email delivery has been voided"
      };

    case "recipient_not_allowed":
      return {
        status: 409,
        code: "MINISTRY_EMAIL_RECIPIENT_NOT_ALLOWED",
        message: "Ministry email recipient is not allowed"
      };

    case "delivery_read_failed":
      return {
        status: 503,
        code: "MINISTRY_EMAIL_DELIVERY_READ_UNAVAILABLE",
        message: "Ministry email delivery cannot be read safely"
      };

    case "already_dispatching_reconciliation_required":
      return {
        status: 409,
        code: "MINISTRY_EMAIL_RECONCILIATION_REQUIRED",
        message: "Ministry email dispatch requires reconciliation"
      };

    case "claim_conflict":
      return {
        status: 409,
        code: "MINISTRY_EMAIL_DISPATCH_CLAIM_CONFLICT",
        message: "Ministry email dispatch claim conflicts with current state"
      };

    case "claim_persistence_uncertain":
      return {
        status: 503,
        code: "MINISTRY_EMAIL_DISPATCH_CLAIM_UNCERTAIN",
        message: "Ministry email dispatch claim persistence is uncertain"
      };

    case "provider_execution_uncertain":
      return {
        status: 503,
        code: "MINISTRY_EMAIL_PROVIDER_EXECUTION_UNCERTAIN",
        message: "Ministry email provider execution is uncertain"
      };

    case "provider_result_persistence_conflict":
      return {
        status: 409,
        code: "MINISTRY_EMAIL_PROVIDER_RESULT_CONFLICT",
        message: "Ministry email provider result conflicts with current state"
      };

    case "provider_result_persistence_uncertain":
      return {
        status: 503,
        code: "MINISTRY_EMAIL_PROVIDER_RESULT_UNCERTAIN",
        message: "Ministry email provider result persistence is uncertain"
      };
  }

  const exhaustive: never = status;
  return exhaustive;
}

export async function postMinistryEmailDeliveryDispatch(
  context: any,
  req: any,
  dependencies:
    PostMinistryEmailDeliveryDispatchDependencies = {}
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

    const deliveryId =
      String(
        req?.params?.deliveryId ?? ""
      ).trim();

    if (!deliveryId) {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body:
          apiErrorBody(
            "INVALID_MINISTRY_EMAIL_DISPATCH_INPUT",
            "deliveryId is required",
            requestId
          )
      };
      return;
    }

    logFunctionInfo(
      context,
      "postMinistryEmailDeliveryDispatch",
      {
        requestId,
        action: "dispatch_requested",
        actorId: auth.actorId,
        deliveryId
      }
    );

    const dispatch =
      dependencies.dispatch ??
      dispatchMinistryEmailDelivery;

    const result =
      await dispatch(deliveryId);

    const failure =
      failureDescriptor(
        result.status
      );

    if (!failure) {
      context.res = {
        status: 200,
        headers: jsonHeaders,
        body: {
          ok: true,
          requestId,
          dispatch: result
        }
      };
      return;
    }

    context.res = {
      status: failure.status,
      headers: jsonHeaders,
      body: {
        ...apiErrorBody(
          failure.code,
          failure.message,
          requestId
        ),
        dispatch: result
      }
    };
  }
  catch (error: any) {
    logFunctionError(
      context,
      "postMinistryEmailDeliveryDispatch",
      error,
      { requestId }
    );

    context.res = {
      status: 500,
      headers: jsonHeaders,
      body:
        apiErrorBody(
          "MINISTRY_EMAIL_DISPATCH_FAILED",
          "Unexpected ministry email dispatch error",
          requestId
        )
    };
  }
}