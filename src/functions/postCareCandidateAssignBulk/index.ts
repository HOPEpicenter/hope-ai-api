import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationProfileByVisitorId,
  getFormationProfilesTableClient
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import {
  createDefaultFormationProfile,
  upsertFormationProfile
} from "../../storage/formation/formationProfilesRepo";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireCareOwnerActor,
  requireCareOwnerAssignee
} from "../_shared/careOwnerStaffActor";

export type CareBulkAssignDependencies = {
  requireApiKey?: typeof requireApiKeyForFunction;
  requireActor?: typeof requireCareOwnerActor;
  requireAssignee?: typeof requireCareOwnerAssignee;
  getTable?: typeof getFormationProfilesTableClient;
  ensureTable?: typeof ensureTable;
  getVisitor?: typeof getVisitorById;
  getProfile?: typeof getFormationProfileByVisitorId;
  createProfile?: typeof createDefaultFormationProfile;
  upsertProfile?: typeof upsertFormationProfile;
};

export async function postCareCandidateAssignBulk(
  context: any,
  req: any,
  dependencies: CareBulkAssignDependencies = {}
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = (
      dependencies.requireApiKey ?? requireApiKeyForFunction
    )(req);

    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ...auth.body,
          authRejectedBy: "postCareCandidateAssignBulk"
        }
      };
      return;
    }

    const assignedTo = String(
      req?.body?.assignedTo ?? ""
    ).trim();

    const visitorIds =
      Array.isArray(req?.body?.visitorIds)
        ? req.body.visitorIds
            .map((v: any) => String(v ?? "").trim())
            .filter(Boolean)
        : [];

    if (!assignedTo) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "assignedTo is required" }
      };
      return;
    }

    if (visitorIds.length === 0) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorIds is required" }
      };
      return;
    }

    const actorAuthorization = await (
      dependencies.requireActor ?? requireCareOwnerActor
    )(req);

    if (!actorAuthorization.ok) {
      context.res = {
        status: actorAuthorization.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: actorAuthorization.body
      };
      return;
    }

    const assigneeAuthorization = await (
      dependencies.requireAssignee ?? requireCareOwnerAssignee
    )(assignedTo);

    if (!assigneeAuthorization.ok) {
      context.res = {
        status: assigneeAuthorization.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: assigneeAuthorization.body
      };
      return;
    }

    const table = (
      dependencies.getTable ?? getFormationProfilesTableClient
    )();

    await (
      dependencies.ensureTable ?? ensureTable
    )(table);

    const results: any[] = [];

    for (const visitorId of visitorIds) {
      const visitor = await (
        dependencies.getVisitor ?? getVisitorById
      )(visitorId);

      if (!visitor) {
        results.push({
          visitorId,
          found: false,
          assigned: false
        });
        continue;
      }

      const existingProfile = await (
        dependencies.getProfile ?? getFormationProfileByVisitorId
      )(table, visitorId);

      const profile = {
        ...(existingProfile ??
          (dependencies.createProfile ?? createDefaultFormationProfile)(
            visitorId
          )),
        partitionKey: "VISITOR" as const,
        rowKey: visitorId,
        visitorId,
        assignedTo,
        updatedAt: new Date().toISOString()
      };

      await (
        dependencies.upsertProfile ?? upsertFormationProfile
      )(table, profile as any);

      results.push({
        visitorId,
        found: true,
        assigned: true
      });
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        assignedTo,
        results
      }
    };
  } catch (err: any) {
    logFunctionError(
      context,
      "postCareCandidateAssignBulk",
      err,
      { requestId }
    );

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "POST_CARE_CANDIDATE_ASSIGN_BULK_FAILED",
        "Unexpected bulk assignment error",
        requestId
      )
    };
  }
}
