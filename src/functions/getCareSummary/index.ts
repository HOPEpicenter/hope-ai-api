import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateList } from "../../services/care/readCareCandidateList";
import { isTerminalFollowupOutcome } from "../../services/followups/isTerminalFollowupOutcome";
import { readCanonicalVisitorDashboardCard } from "../../services/dashboard/readCanonicalVisitorDashboardCard";
import type { CanonicalVisitorDashboardCard } from "../../services/dashboard/canonicalDashboardContracts";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

function toCareProfileInput(profile: FunctionFormationProfileEntity) {
  return {
    visitorId: profile.visitorId,
    assignedTo: profile.assignedTo ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null
  };
}

function isOpenAssignedFollowup(
  profile: FunctionFormationProfileEntity
): boolean {
  return (
    !!profile.assignedTo &&
    !(
      !!profile.lastFollowupOutcomeAt &&
      isTerminalFollowupOutcome(profile.lastFollowupOutcome)
    )
  );
}

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

      validProfiles.push(profile);
    }

    const canonicalCardsByVisitorId = new Map<
      string,
      CanonicalVisitorDashboardCard
    >();

    await Promise.all(
      validProfiles.map(async (profile) => {
        const visitorId = String(profile.visitorId ?? "").trim();

        if (!visitorId || canonicalCardsByVisitorId.has(visitorId)) {
          return;
        }

        canonicalCardsByVisitorId.set(
          visitorId,
          await readCanonicalVisitorDashboardCard(visitorId)
        );
      })
    );

    const summaryProfiles = validProfiles
      .filter(isOpenAssignedFollowup)
      .map((profile) => {
        const visitorId = String(profile.visitorId ?? "").trim();
        const card = canonicalCardsByVisitorId.get(visitorId);

        return {
          visitorId,
          assignedTo:
            card?.assignedTo ??
            profile.assignedTo ??
            null,
          lastFollowupOutcome: "needs_care",
          lastFollowupOutcomeAt:
            card?.lastFollowupAssignedAt ??
            profile.lastFollowupAssignedAt ??
            card?.lastFollowupOutcomeAt ??
            profile.lastFollowupOutcomeAt ??
            card?.lastActivityAt ??
            new Date(0).toISOString()
        };
      });

    const projected = readCareCandidateList({
      profiles: summaryProfiles,
      canonicalCardsByVisitorId,
      carePriority: String(req?.query?.priority ?? "").trim() || null,
      careAgeBucket: String(req?.query?.ageBucket ?? "").trim() || null,
      escalationLevel: String(req?.query?.escalationLevel ?? "").trim() || null,
      assignmentState: String(req?.query?.assignmentState ?? "").trim() || null,
      assignmentBucket: String(req?.query?.assignmentBucket ?? "").trim() || null
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
