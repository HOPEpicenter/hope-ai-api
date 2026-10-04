import { getFeatureFlags } from "../../config/featureFlags";
import type {
  ResolveMinistryEmailDispatchRecoveryResultV1
} from "../../contracts/ministryEmailDispatchRecovery.v1";
import {
  resolveMinistryEmailDispatchRecovery
} from "../../services/communications/resolveMinistryEmailDispatchRecovery";
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

export type PostMinistryEmailDispatchRecoveryDependencies = {
  authorize?: typeof requireAdminStaffActorForFunction;
  resolveRecovery?: typeof resolveMinistryEmailDispatchRecovery;
  getFlags?: () => {
    ministryEmailDispatchRecovery: boolean;
  };
};

function failureStatus(
  result: Extract<
    ResolveMinistryEmailDispatchRecoveryResultV1,
    { ok: false }
  >
): number {
  switch (result.code) {
    case "INVALID_RECOVERY_INPUT":
      return 400;

    case "DELIVERY_NOT_FOUND":
      return 404;

    case "DELIVERY_NOT_DISPATCHING":
    case "DISPATCH_ATTEMPT_MISMATCH":
    case "RECOVERY_REPLAY_CONFLICT":
    case "RECOVERY_TRANSITION_CONFLICT":
      return 409;

    case "RECOVERY_PERSISTENCE_UNCERTAIN":
      return 503;

    case "RECOVERY_STORAGE_INVARIANT_VIOLATION":
      return 500;
  }
}

function failureMessage(status: number): string {
  if (status === 400) {
    return "Invalid ministry email dispatch recovery request";
  }

  if (status === 404) {
    return "Ministry email delivery not found";
  }

  if (status === 409) {
    return "Ministry email dispatch recovery conflicts with current state";
  }

  if (status === 503) {
    return "Ministry email dispatch recovery persistence is uncertain";
  }

  return "Ministry email dispatch recovery cannot be completed safely";
}

export async function postMinistryEmailDispatchRecovery(
  context: any,
  req: any,
  dependencies: PostMinistryEmailDispatchRecoveryDependencies = {}
): Promise<void> {
  const requestId = getRequestId(req);

  const flags = (dependencies.getFlags ?? getFeatureFlags)();

  if (!flags.ministryEmailDispatchRecovery) {
    context.res = {
      status: 404,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_DISPATCH_RECOVERY_DISABLED",
        "Ministry email dispatch recovery is unavailable",
        requestId
      )
    };
    return;
  }

  try {
    const authorize =
      dependencies.authorize ??
      requireAdminStaffActorForFunction;

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

    const body = req?.body ?? {};

    const resolveRecovery =
      dependencies.resolveRecovery ??
      resolveMinistryEmailDispatchRecovery;

    const result = await resolveRecovery({
      resolutionId: body.resolutionId,
      deliveryId,
      dispatchAttemptId: body.dispatchAttemptId,
      actorId: auth.actorId,
      resolvedAt: body.resolvedAt,
      evidence: body.evidence
    });

    if (result.ok) {
      context.res = {
        status: result.status === "resolved" ? 201 : 200,
        headers: jsonHeaders,
        body: {
          ok: true,
          requestId,
          status: result.status,
          recovery: {
            resolutionId: result.audit.resolutionId,
            deliveryId: result.audit.deliveryId,
            dispatchAttemptId: result.audit.dispatchAttemptId,
            decision: result.audit.decision,
            resolvedAt: result.audit.resolvedAt,
            provider: result.audit.provider,
            evidenceKind: result.audit.evidenceKind,
            evidenceSource: result.audit.evidenceSource,
            evidenceId: result.audit.evidenceId,
            evidenceObservedAt: result.audit.evidenceObservedAt,
            providerMessageId: result.audit.providerMessageId,
            failureCode: result.audit.failureCode
          }
        }
      };
      return;
    }

    const status = failureStatus(result);

    context.res = {
      status,
      headers: jsonHeaders,
      body: apiErrorBody(
        result.code,
        failureMessage(status),
        requestId
      )
    };
  } catch (error: any) {
    logFunctionError(
      context,
      "postMinistryEmailDispatchRecovery",
      error,
      { requestId }
    );

    context.res = {
      status: 500,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_DISPATCH_RECOVERY_FAILED",
        "Unexpected ministry email dispatch recovery error",
        requestId
      )
    };
  }
}