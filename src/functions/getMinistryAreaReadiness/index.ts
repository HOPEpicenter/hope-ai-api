import {
  readMinistryAreaReadiness
} from "../../services/ministryAreas/readMinistryAreaReadiness";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

export async function getMinistryAreaReadiness(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth =
      await requireAdminStaffActorForFunction(req);

    if (!auth.ok) {
      context.res = {
        status: auth.status,
        body: {
          ...auth.body,
          requestId
        }
      };

      return;
    }

    const ministryAreaId =
      String(req?.params?.ministryAreaId ?? "").trim();

    if (!ministryAreaId) {
      context.res = {
        status: 400,
        body: {
          ok: false,
          requestId,
          error: "ministryAreaId is required"
        }
      };

      return;
    }

    const readiness =
      await readMinistryAreaReadiness(ministryAreaId);

    if (!readiness) {
      context.res = {
        status: 404,
        body: {
          ok: false,
          requestId,
          error: "Ministry Area not found"
        }
      };

      return;
    }

    context.res = {
      status: 200,
      body: {
        ok: true,
        requestId,
        ministryAreaId:
          readiness.ministryArea.ministryAreaId,
        readiness
      }
    };
  } catch (error: any) {
    logFunctionError(
      context,
      "getMinistryAreaReadiness",
      error,
      {
        requestId,
        ministryAreaId:
          req?.params?.ministryAreaId ?? null
      }
    );

    context.res = {
      status: 500,
      body: apiErrorBody(
        "GET_MINISTRY_AREA_READINESS_FAILED",
        "Unexpected Ministry Area readiness error",
        requestId
      )
    };
  }
}