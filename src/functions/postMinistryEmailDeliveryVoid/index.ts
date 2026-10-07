import {
  voidMinistryEmailDelivery,
  type VoidMinistryEmailDeliveryResult
} from "../../services/communications/voidMinistryEmailDelivery";
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

export type PostMinistryEmailDeliveryVoidDependencies = {
  authorize?: typeof requireAdminStaffActorForFunction;
  voidDelivery?: (input: {
    deliveryId: string;
    actorId: string;
    reason: unknown;
  }) => Promise<VoidMinistryEmailDeliveryResult>;
};

function respond(
  context: any,
  status: number,
  body: unknown
): void {
  context.res = { status, headers: jsonHeaders, body };
}

/**
 * Responses never echo subject, body, recipient, reason or storage errors.
 * voidedBy is always the authenticated administrator, never request input.
 */
export async function postMinistryEmailDeliveryVoid(
  context: any,
  req: any,
  dependencies: PostMinistryEmailDeliveryVoidDependencies = {}
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = await (
      dependencies.authorize ?? requireAdminStaffActorForFunction
    )(req);
    if (!auth.ok) {
      respond(context, auth.status, { ...auth.body, requestId });
      return;
    }

    const deliveryId = String(req?.params?.deliveryId ?? "").trim();
    if (!deliveryId) {
      respond(context, 400, apiErrorBody(
        "INVALID_MINISTRY_EMAIL_DELIVERY_VOID_INPUT",
        "deliveryId is required",
        requestId
      ));
      return;
    }

    const body = req?.body;
    const reason =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as { reason?: unknown }).reason
        : undefined;

    logFunctionInfo(context, "postMinistryEmailDeliveryVoid", {
      requestId,
      action: "void_requested",
      actorId: auth.actorId,
      deliveryId
    });

    const result = await (
      dependencies.voidDelivery ?? voidMinistryEmailDelivery
    )({ deliveryId, actorId: auth.actorId, reason });

    switch (result.status) {
      case "voided":
      case "already_voided":
        respond(context, 200, {
          ok: true,
          requestId,
          void: {
            deliveryId: result.deliveryId,
            state: "voided",
            voidedAt: result.voidedAt,
            alreadyVoided: result.status === "already_voided"
          }
        });
        return;
      case "invalid_input":
        respond(context, 400, apiErrorBody(
          "INVALID_MINISTRY_EMAIL_DELIVERY_VOID_INPUT",
          result.field === "reason"
            ? "reason is required and must be at most 240 characters"
            : "Invalid ministry email delivery void request",
          requestId
        ));
        return;
      case "not_found":
        respond(context, 404, apiErrorBody(
          "MINISTRY_EMAIL_DELIVERY_NOT_FOUND",
          "Ministry email delivery not found",
          requestId
        ));
        return;
      case "not_voidable":
        respond(context, 409, apiErrorBody(
          "MINISTRY_EMAIL_DELIVERY_NOT_VOIDABLE",
          "Ministry email delivery cannot be voided in its current state",
          requestId
        ));
        return;
      case "conflict":
        respond(context, 409, apiErrorBody(
          "MINISTRY_EMAIL_DELIVERY_VOID_CONFLICT",
          "Ministry email delivery void conflicts with current state",
          requestId
        ));
        return;
      case "persistence_uncertain":
        respond(context, 503, apiErrorBody(
          "MINISTRY_EMAIL_DELIVERY_VOID_UNCERTAIN",
          "Ministry email delivery void persistence is uncertain",
          requestId
        ));
        return;
    }
  } catch (error: any) {
    logFunctionError(context, "postMinistryEmailDeliveryVoid", error, { requestId });
    respond(context, 500, apiErrorBody(
      "MINISTRY_EMAIL_DELIVERY_VOID_FAILED",
      "Unexpected ministry email delivery void error",
      requestId
    ));
  }
}
