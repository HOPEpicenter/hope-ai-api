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

export async function postCareCandidateAssignBulk(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);

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

    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const results: any[] = [];

    for (const visitorId of visitorIds) {
      const visitor = await getVisitorById(visitorId);

      if (!visitor) {
        results.push({
          visitorId,
          found: false,
          assigned: false
        });
        continue;
      }

      const existingProfile =
        await getFormationProfileByVisitorId(
          table,
          visitorId
        );

      const profile = {
        ...(existingProfile ??
          createDefaultFormationProfile(visitorId)),
        partitionKey: "VISITOR" as const,
        rowKey: visitorId,
        visitorId,
        assignedTo,
        updatedAt: new Date().toISOString()
      };

      await upsertFormationProfile(
        table,
        profile as any
      );

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
