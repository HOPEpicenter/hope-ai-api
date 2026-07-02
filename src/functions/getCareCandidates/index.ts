import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateList } from "../../services/care/readCareCandidateList";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

function parseLimit(val: unknown, fallback = 200): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 500));
}

function parseFilter(val: unknown): string | undefined {
  const text = typeof val === "string" ? val.trim() : "";
  return text.length > 0 ? text : undefined;
}

function parseCursor(val: unknown): string | undefined {
  const text = typeof val === "string" ? val.trim() : "";
  return text.length > 0 ? text : undefined;
}

function toCareProfileInput(profile: FunctionFormationProfileEntity) {
  return {
    visitorId: profile.visitorId,
    assignedTo: profile.assignedTo ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null
  };
}

export async function getCareCandidates(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const limit = parseLimit(req?.query?.limit, 200);
    const requestedCursor = parseCursor(req?.query?.cursor);

    const carePriority = parseFilter(req?.query?.priority);
    const careAgeBucket = parseFilter(req?.query?.ageBucket);
    const escalationLevel = parseFilter(req?.query?.escalationLevel);
    const assignmentState = parseFilter(req?.query?.assignmentState);
    const assignmentBucket = parseFilter(req?.query?.assignmentBucket);

    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const validProfiles: FunctionFormationProfileEntity[] = [];
    let orphanProfilesExcluded = 0;
    let cursor: string | undefined = requestedCursor;
    let nextCursor: string | undefined = undefined;
    let projected = readCareCandidateList({
      profiles: [],
      carePriority,
      careAgeBucket,
      escalationLevel,
      assignmentState,
      assignmentBucket
    });

    do {
      const page = await listFormationProfiles(table, {
        limit: 200,
        cursor
      });

      cursor = page.cursor ?? undefined;
      nextCursor = cursor;

      for (const profile of page.items) {
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

        validProfiles.push(profile);
      }

      projected = readCareCandidateList({
        profiles: validProfiles.map(toCareProfileInput),
        carePriority,
        careAgeBucket,
        escalationLevel,
        assignmentState,
        assignmentBucket
      });
    } while (projected.items.length < limit && cursor);

    const pageItems = projected.items.slice(0, limit);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        count: pageItems.length,
        limit,
        cursor: nextCursor,
        nextCursor,
        items: pageItems,
        summary: projected.summary,
        projectionIntegrity: {
          orphanProfilesExcluded
        }
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getCareCandidates", err, {
      requestId,
      limit: req?.query?.limit ?? null,
      cursor: req?.query?.cursor ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_CARE_CANDIDATES_FAILED",
        "Unexpected care candidates error",
        requestId
      )
    };
  }
}
