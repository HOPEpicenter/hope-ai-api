import { requireApiKeyForFunction } from "../_shared/apiKey";
import { contactWriterHoldEnabled } from "../../services/followups/permanentVisitorContactWriterHold";
import { mayExposeRegistrationContactWork } from "../../services/followups/mayExposeRegistrationContactWork";
import { isTerminalFollowupOutcome } from "../../services/followups/isTerminalFollowupOutcome";
import {
  getFormationProfilesTableClient,
  mayExposeCommittedCareAssignment,
  listFormationProfiles,
  ensureTable,
  type FunctionFormationProfileEntity,
  CorrectionReplayUnavailableError
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
import {
  readHighRiskStaffVisibility
} from "../_shared/highRiskStaffActor";
import {
  redactDashboardPastoralRisk
} from "../../services/authorization/redactDashboardPastoralRisk";

export function careProfileFallbackAllowed(): boolean {
  return !contactWriterHoldEnabled();
}

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

type DashboardFollowupDependencies = {
  readStaff?: Parameters<typeof readHighRiskStaffVisibility>[1];
  readPage?: (
    input: Parameters<typeof listFormationProfiles>[1]
  ) => ReturnType<typeof listFormationProfiles>;
  readVisitor?: typeof getVisitorById;
  readCard?: typeof readCanonicalVisitorDashboardCard;
  mayExposeProtected?: typeof mayExposeCommittedCareAssignment;
  mayExposeLegacy?: typeof mayExposeRegistrationContactWork;
};

export async function getDashboardFollowups(
  context: any,
  req: any,
  deps: DashboardFollowupDependencies = {}
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
    const visibility =
      await readHighRiskStaffVisibility(req, deps.readStaff);

    if (!visibility.ok) {
      context.res = {
        status: visibility.status,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: visibility.body
      };
      return;
    }

    const limit = parseLimit(req?.query?.limit, 200);
    const requestedCursor = parseCursor(req?.query?.cursor);

    const protectedCareView =
      req?.query?.careOwnershipOnly === "true" &&
      contactWriterHoldEnabled() &&
      process.env.FEATURE_PERMANENT_VISITOR_CARE_ASSIGNMENT === "true";

    const table = deps.readPage
      ? null
      : getFormationProfilesTableClient();

    if (table) await ensureTable(table);

    const readPage = deps.readPage ??
      (input => listFormationProfiles(table!, input));

    const readVisitor = deps.readVisitor ?? getVisitorById;
    const readCard = deps.readCard ?? readCanonicalVisitorDashboardCard;

    const protectedCards = new Map<
      string,
      Awaited<ReturnType<typeof readCanonicalVisitorDashboardCard>>
    >();

    const collected: FunctionFormationProfileEntity[] = [];
    let orphanFollowupsExcluded = 0;
    let sourceCursor = requestedCursor;
    let sourceHasMore = true;

    while (collected.length < (limit + 1) && sourceHasMore) {
      const page = await readPage({
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

        if (!protectedCareView &&
            !(await (
              deps.mayExposeLegacy ?? mayExposeRegistrationContactWork
            )(visitorId))) {
          continue;
        }

        const visitor = await readVisitor(visitorId);

        if (!visitor) {
          orphanFollowupsExcluded++;
          continue;
        }

        if (protectedCareView) {
          const card = await readCard(visitorId);

          if (card.visitorId !== visitorId ||
              card.assignedTo !== profile.assignedTo ||
              card.lastFollowupAssignedAt !== profile.lastFollowupAssignedAt ||
              card.followupResolved ||
              !(await (
                deps.mayExposeProtected ??
                mayExposeCommittedCareAssignment
              )(profile))) {
            continue;
          }

          protectedCards.set(visitorId, card);
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

        const visitor = await readVisitor(visitorId);

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
          protectedCards.get(visitorId) ?? await readCard(visitorId)
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

      return redactDashboardPastoralRisk(
        {
          visitorId,
          displayName,
          name: displayName,
          email: protectedCareView ? null : visitorIdentity.email,
          ...(protectedCareView ? {
            careWorkflow: "consent_protected_care_ownership" as const
          } : {}),
          assignedTo:
            card.assignedTo ??
            projection.assignedTo,
          assignedToName:
            card.assignedToName ??
            projection.assignedToName,
          projectionMetadata:
            projection.projectionMetadata,
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
          lastFollowupContactedAt:
            p.lastFollowupContactedAt ??
            null,
          lastFollowupOutcomeAt:
            card.lastFollowupOutcomeAt ??
            p.lastFollowupOutcomeAt ??
            null
        },
        visibility.canViewHighRiskAlerts
      );
    });

    const projectionIntegrity =
      buildProjectionIntegrityEnvelope({
        orphanProfilesExcluded: orphanFollowupsExcluded
      });

    context.res = {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body: {
        ok: true,
        requestId,
        ...(req?.query?.careOwnershipOnly === "true"
          ? {
              careProfileFallbackAllowed:
                careProfileFallbackAllowed()
            }
          : {}),
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
    if (err instanceof CorrectionReplayUnavailableError) {
      context.res = {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          requestId,
          error: err.code
        }
      };
      return;
    }

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
