import type {
  FunctionFormationProfileEntity
} from "../../functions/_shared/formation";
import type {
  CanonicalVisitorDashboardCard
} from "../dashboard/canonicalDashboardContracts";
import {
  readCanonicalVisitorDashboardCard
} from "../dashboard/readCanonicalVisitorDashboardCard";
import {
  isTerminalFollowupOutcome
} from "../followups/isTerminalFollowupOutcome";
import {
  readCareCandidateList,
  type ReadCareCandidateListResult
} from "./readCareCandidateList";

export type CanonicalCareProjectionFilters = {
  carePriority?: string | null;
  careAgeBucket?: string | null;
  escalationLevel?: string | null;
  assignmentState?: string | null;
  assignmentBucket?: string | null;
};

export type ReadCanonicalCareProjectionInput =
  CanonicalCareProjectionFilters & {
    profiles: readonly FunctionFormationProfileEntity[];
    readDashboardCard?: (
      visitorId: string
    ) => Promise<CanonicalVisitorDashboardCard>;
  };

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

export async function readCanonicalCareProjection(
  input: ReadCanonicalCareProjectionInput
): Promise<ReadCareCandidateListResult> {
  const readDashboardCard =
    input.readDashboardCard ??
    readCanonicalVisitorDashboardCard;

  const canonicalCardsByVisitorId = new Map<
    string,
    CanonicalVisitorDashboardCard
  >();

  await Promise.all(
    input.profiles.map(async (profile) => {
      const visitorId = String(
        profile.visitorId ?? ""
      ).trim();

      if (
        !visitorId ||
        canonicalCardsByVisitorId.has(visitorId)
      ) {
        return;
      }

      canonicalCardsByVisitorId.set(
        visitorId,
        await readDashboardCard(visitorId)
      );
    })
  );

  const summaryProfiles = input.profiles
    .filter(isOpenAssignedFollowup)
    .map((profile) => {
      const visitorId = String(
        profile.visitorId ?? ""
      ).trim();

      const card =
        canonicalCardsByVisitorId.get(visitorId);

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

  return readCareCandidateList({
    profiles: summaryProfiles,
    canonicalCardsByVisitorId,
    carePriority: input.carePriority,
    careAgeBucket: input.careAgeBucket,
    escalationLevel: input.escalationLevel,
    assignmentState: input.assignmentState,
    assignmentBucket: input.assignmentBucket
  });
}
