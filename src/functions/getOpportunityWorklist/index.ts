import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import {
  buildOpportunityWorklistItem,
  getOpportunitySegmentDefinition
} from "../../services/intelligence/opportunitySegments";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

function parseLimit(val: unknown, fallback = 100): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 200));
}

function parseCursor(val: unknown): string | undefined {
  const text = typeof val === "string" ? val.trim() : "";
  return text.length > 0 ? text : undefined;
}

export async function getOpportunityWorklist(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
      return;
    }

    const segment = String(req?.params?.segment ?? "").trim();
    const definition = getOpportunitySegmentDefinition(segment);

    if (!definition) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          requestId,
          error: "Unsupported opportunity segment",
          segment
        }
      };
      return;
    }

    const limit = parseLimit(req?.query?.limit, 100);
    const requestedCursor = parseCursor(req?.query?.cursor);

    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const page = await listFormationProfiles(table, {
      limit,
      cursor: requestedCursor,
      segment: definition.segment
    });

    const items: any[] = [];
    let orphanProfilesExcluded = 0;

    for (const profile of page.items as FunctionFormationProfileEntity[]) {
      const visitorId = String(profile.visitorId ?? profile.rowKey ?? "").trim();

      if (!visitorId) {
        orphanProfilesExcluded++;
        continue;
      }

      const visitor = await getVisitorById(visitorId);

      if (!visitor) {
        orphanProfilesExcluded++;
        continue;
      }

      items.push(buildOpportunityWorklistItem({
        profile,
        visitor,
        definition
      }));
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        segment: definition.segment,
        label: definition.label,
        count: items.length,
        limit,
        cursor: page.cursor ?? null,
        nextCursor: page.cursor ?? null,
        generatedAt: new Date().toISOString(),
        items,
        projectionIntegrity: {
          orphanProfilesExcluded
        }
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getOpportunityWorklist", err, {
      requestId,
      segment: req?.params?.segment ?? null,
      limit: req?.query?.limit ?? null,
      cursor: req?.query?.cursor ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_OPPORTUNITY_WORKLIST_FAILED",
        "Unexpected opportunity worklist error",
        requestId
      )
    };
  }
}
