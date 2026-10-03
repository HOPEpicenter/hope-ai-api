import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { isSyntheticVisitorRecord } from "../../services/visitors/isSyntheticVisitorRecord";
import {
  readCanonicalCareProjection
} from "../../services/care/readCanonicalCareProjection";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";


async function listAllFormationProfiles(
  table: any
): Promise<FunctionFormationProfileEntity[]> {
  const profiles: FunctionFormationProfileEntity[] = [];
  let cursor: string | undefined = undefined;

  do {
    const page = await listFormationProfiles(table, {
      limit: 200,
      cursor
    });

    profiles.push(...page.items);
    cursor = page.cursor ?? undefined;
  } while (cursor);

  return profiles;
}

export async function getCareSummary(
  context: any,
  req: any
): Promise<void> {
  const auth = requireApiKeyForFunction(req);

  if (!auth.ok) {
    context.res = {
      status: auth.status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: auth.body
    };
    return;
  }

  const requestId = getRequestId(req);

  try {
    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const profiles = await listAllFormationProfiles(table);

    const validProfiles: FunctionFormationProfileEntity[] = [];
    let orphanProfilesExcluded = 0;

    for (const profile of profiles) {
      const visitorId = String(profile.visitorId ?? "").trim();

      if (!visitorId) {
        orphanProfilesExcluded++;
        continue;
      }

      const visitor = await getVisitorById(visitorId);

      if (!visitor) {
        orphanProfilesExcluded++;
        continue;
      }

      if (isSyntheticVisitorRecord(visitor)) {
        continue;
      }

      validProfiles.push(profile);
    }

    const projected = await readCanonicalCareProjection({
      profiles: validProfiles,
      carePriority:
        String(req?.query?.priority ?? "").trim() || null,
      careAgeBucket:
        String(req?.query?.ageBucket ?? "").trim() || null,
      escalationLevel:
        String(req?.query?.escalationLevel ?? "").trim() || null,
      assignmentState:
        String(req?.query?.assignmentState ?? "").trim() || null,
      assignmentBucket:
        String(req?.query?.assignmentBucket ?? "").trim() || null
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        summary: projected.summary,
        projectionIntegrity: {
          orphanProfilesExcluded
        }
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getCareSummary", err, { requestId });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_CARE_SUMMARY_FAILED",
        "Unexpected care summary error",
        requestId
      )
    };
  }
}
