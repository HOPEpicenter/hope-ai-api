import {
  readMinistryEmailDispatchInspection
} from "../../services/communications/readMinistryEmailDispatchInspection";
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

export type GetMinistryEmailDispatchInspectionDependencies = {
  authorize?: typeof requireAdminStaffActorForFunction;
  readInspection?: typeof readMinistryEmailDispatchInspection;
};

export async function getMinistryEmailDispatchInspection(
  context: any,
  req: any,
  dependencies: GetMinistryEmailDispatchInspectionDependencies = {}
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const authorize =
      dependencies.authorize ?? requireAdminStaffActorForFunction;

    const auth = await authorize(req);

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

    const deliveryId = String(
      req?.params?.deliveryId ?? ""
    ).trim();

    if (!deliveryId) {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          "INVALID_INSPECTION_INPUT",
          "deliveryId is required",
          requestId
        )
      };
      return;
    }

    const readInspection =
      dependencies.readInspection ??
      readMinistryEmailDispatchInspection;

    const result = await readInspection(deliveryId);

    if (result.ok) {
      context.res = {
        status: 200,
        headers: jsonHeaders,
        body: {
          ok: true,
          requestId,
          inspection: result.inspection
        }
      };
      return;
    }

    if (result.code === "INVALID_INSPECTION_INPUT") {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          result.code,
          "Invalid ministry email dispatch inspection request",
          requestId
        )
      };
      return;
    }

    if (result.code === "DELIVERY_NOT_FOUND") {
      context.res = {
        status: 404,
        headers: jsonHeaders,
        body: apiErrorBody(
          result.code,
          "Ministry email delivery not found",
          requestId
        )
      };
      return;
    }

    if (result.code === "DELIVERY_INSPECTION_UNAVAILABLE") {
      context.res = {
        status: 503,
        headers: jsonHeaders,
        body: apiErrorBody(
          result.code,
          "Ministry email dispatch inspection is unavailable",
          requestId
        )
      };
      return;
    }

    context.res = {
      status: 500,
      headers: jsonHeaders,
      body: apiErrorBody(
        "INVALID_DELIVERY_RECORD",
        "Stored ministry email delivery cannot be inspected safely",
        requestId
      )
    };
  } catch (error: any) {
    logFunctionError(
      context,
      "getMinistryEmailDispatchInspection",
      error,
      { requestId }
    );

    context.res = {
      status: 500,
      headers: jsonHeaders,
      body: apiErrorBody(
        "GET_MINISTRY_EMAIL_DISPATCH_INSPECTION_FAILED",
        "Unexpected ministry email dispatch inspection error",
        requestId
      )
    };
  }
}