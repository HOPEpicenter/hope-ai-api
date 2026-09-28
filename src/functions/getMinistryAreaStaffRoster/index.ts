import {
  readMinistryAreaStaffRoster
} from "../../services/ministryAreas/readMinistryAreaStaffRoster";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

export async function getMinistryAreaStaffRoster(
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

    const roster =
      await readMinistryAreaStaffRoster(ministryAreaId);

    if (!roster) {
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
          roster.ministryArea.ministryAreaId,
        ministryArea: roster.ministryArea,
        count: roster.items.length,
        items: roster.items
      }
    };
  } catch (error: any) {
    logFunctionError(
      context,
      "getMinistryAreaStaffRoster",
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
        "GET_MINISTRY_AREA_STAFF_ROSTER_FAILED",
        "Unexpected Ministry Area Staff roster error",
        requestId
      )
    };
  }
}
