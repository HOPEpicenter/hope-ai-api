import {
  readMinistryAreaOverview
} from "../../services/ministryAreas/readMinistryAreaOverview";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

export async function getMinistryAreaOverview(
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

    const overview =
      await readMinistryAreaOverview(ministryAreaId);

    if (!overview) {
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
          overview.ministryArea.ministryAreaId,
        overview
      }
    };
  } catch (error: any) {
    logFunctionError(
      context,
      "getMinistryAreaOverview",
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
        "GET_MINISTRY_AREA_OVERVIEW_FAILED",
        "Unexpected Ministry Area overview error",
        requestId
      )
    };
  }
}