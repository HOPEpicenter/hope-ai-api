import { isTerminalFollowupOutcome } from "../../services/followups/isTerminalFollowupOutcome";
import {
  getFormationProfilesTableClient,
  listFormationProfiles,
  ensureTable,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { projectFollowupState } from "../_shared/followupProjection";
import { getVisitorById } from "../_shared/visitorsRepository";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import { readCanonicalVisitorIdentity, type CanonicalVisitorIdentity } from "../../services/dashboard/visitorIdentity";
import { resolveCanonicalDisplayName } from "../../services/dashboard/resolveCanonicalDisplayName";
import { buildProjectionIntegrityEnvelope } from "../../shared/integration/projectionIntegrityEnvelope";
import { readCanonicalVisitorDashboardCard } from "../../services/dashboard/readCanonicalVisitorDashboardCard";

function parseLimit(val: unknown, fallback = 200): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 500));
}

function parseCursor(val: unknown): string | undefined {
  const text = typeof val === "string" ? val.trim() : "";
  return text.length > 0 ? text : undefined;
}

function isOpenAssignedFollowup(profile: FunctionFormationProfileEntity): boolean {
  return !!profile.assignedTo && !(!!profile.lastFollowupOutcomeAt && isTerminalFollowupOutcome(profile.lastFollowupOutcome));
}

export async function getDashboardFollowups(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const limit = parseLimit(req?.query?.limit, 200);
    const requestedCursor = parseCursor(req?.query?.cursor);

    const table = getFormationProfilesTableClient();

    await ensureTable(table);

    const collected: FunctionFormationProfileEntity[] = [];
    let orphanFollowupsExcluded = 0;
    let sourceCursor = requestedCursor;
    let sourceHasMore = true;

    while (collected.length < (limit + 1) && sourceHasMore) {
      const page = await listFormationProfiles(table, {
        limit: 200,
        cursor: sourceCursor
      });

      const openAssigned = page.items.filter(isOpenAssignedFollowup);

      for (const profile of openAssigned) {
        const visitorId = String(profile.visitorId ?? "").trim();

        if (!visitorId) {
          orphanFollowupsExcluded++;
          continue;
        }

        const visitor = await getVisitorById(visitorId);

        if (!visitor) {
          orphanFollowupsExcluded++;
          continue;
        }

        collected.push(profile);
      }

      if (page.cursor) {
        sourceCursor = page.cursor;
      } else {
        sourceHasMore = false;
      }

      if (!page.cursor) {
        break;
      }

      if (page.items.length === 0) {
        break;
      }
    }

    const pageItems = collected.slice(0, limit);
    const nextCursor =
      collected.length > limit && pageItems.length > 0
        ? pageItems[pageItems.length - 1].rowKey
        : null;

    const visitorIdentityById = new Map<string, CanonicalVisitorIdentity>();

    await Promise.all(
      pageItems.map(async (p) => {
        const visitorId = String(p.visitorId ?? "").trim();
        if (!visitorId || visitorIdentityById.has(visitorId)) return;

        const visitor = await getVisitorById(visitorId);

        visitorIdentityById.set(
          visitorId,
          readCanonicalVisitorIdentity(visitorId, visitor)
        );
      })
    );

    const dashboardCardByVisitorId = new Map<
      string,
      Awaited<ReturnType<typeof readCanonicalVisitorDashboardCard>>
    >();

    await Promise.all(
      pageItems.map(async (p) => {
        const visitorId = String(p.visitorId ?? "").trim();

        if (!visitorId || dashboardCardByVisitorId.has(visitorId)) {
          return;
        }

        dashboardCardByVisitorId.set(
          visitorId,
          await readCanonicalVisitorDashboardCard(visitorId)
        );
      })
    );

    const items = pageItems.map((p) => {
      const projection = projectFollowupState(p);

      const visitorId = String(p.visitorId ?? "").trim();
      const visitorIdentity =
        visitorIdentityById.get(visitorId) ??
        readCanonicalVisitorIdentity(visitorId, null);

      const displayName =
        resolveCanonicalDisplayName(
          visitorId,
          p.displayName,
          visitorIdentity.displayName
        );

      const card =
        dashboardCardByVisitorId.get(visitorId);

      if (!card) {
        throw new Error(
          `Canonical dashboard card unavailable for visitor ${visitorId}`
        );
      }

      return {
        visitorId,
        displayName,
        name: displayName,
        email: visitorIdentity.email,
        assignedTo: card.assignedTo ?? projection.assignedTo,
        assignedToName: card.assignedToName ?? projection.assignedToName,
        projectionMetadata: projection.projectionMetadata,
        followupState: projection.followupState,
        attentionState: projection.attentionState,
        stage: card.stage,
        followupStatus: card.followupStatus,
        followupUrgency: card.followupUrgency,
        followupOverdue: card.followupOverdue,
        riskLevel: card.riskLevel,
        riskScore: card.riskScore,
        needsFollowup: card.needsFollowup,
        recommendedAction: card.recommendedAction,
        priorityBand: card.priorityBand,
        priorityScore: card.priorityScore,
        priorityReason: card.priorityReason,
        lastFollowupAssignedAt:
          card.lastFollowupAssignedAt ??
          p.lastFollowupAssignedAt ??
          null,
        lastFollowupContactedAt: p.lastFollowupContactedAt ?? null,
        lastFollowupOutcomeAt:
          card.lastFollowupOutcomeAt ??
          p.lastFollowupOutcomeAt ??
          null
      };
    });

    const projectionIntegrity =
      buildProjectionIntegrityEnvelope({
        orphanProfilesExcluded: orphanFollowupsExcluded
      });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        count: items.length,
        limit,
        cursor: nextCursor,
        nextCursor,
        items,
        projectionIntegrity: {
          ...projectionIntegrity.projectionIntegrity,
          orphanFollowupsExcluded
        }
      }
    };

  } catch (err: any) {
    logFunctionError(context, "getDashboardFollowups", err, {
      requestId,
      limit: req?.query?.limit ?? null,
      cursor: req?.query?.cursor ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_DASHBOARD_FOLLOWUPS_FAILED",
        "Unexpected dashboard followups error",
        requestId
      )
    };
  }
}

