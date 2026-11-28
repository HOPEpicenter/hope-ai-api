import {
  mayExposeCommittedCareAssignment,
  type FunctionFormationProfileEntity
} from "../../functions/_shared/formation";
import { contactWriterHoldEnabled } from "../followups/permanentVisitorContactWriterHold";
import type {
  CanonicalVisitorDashboardCard
} from "../dashboard/canonicalDashboardContracts";
import {
  readCanonicalVisitorDashboardCard
} from "../dashboard/readCanonicalVisitorDashboardCard";
import {
  isTerminalFollowupOutcome
} from "../followups/isTerminalFollowupOutcome";
import { mayExposeRegistrationContactWork } from "../followups/mayExposeRegistrationContactWork";
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

  const protectedMode = contactWriterHoldEnabled() &&
    process.env.FEATURE_PERMANENT_VISITOR_CARE_ASSIGNMENT === "true";

  const eligibleProfiles: FunctionFormationProfileEntity[] = [];

  for (const profile of input.profiles) {
    if (protectedMode) {
      if (!isOpenAssignedFollowup(profile)) continue;
    } else if (isOpenAssignedFollowup(profile) &&
        !(await mayExposeRegistrationContactWork(String(profile.visitorId ?? "").trim()))) {
      continue;
    }

    eligibleProfiles.push(profile);
  }

  const canonicalCardsByVisitorId = new Map<
    string,
    CanonicalVisitorDashboardCard
  >();

  await Promise.all(
    eligibleProfiles.map(async (profile) => {
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

  const verifiedProfiles: FunctionFormationProfileEntity[] = [];

  for (const profile of eligibleProfiles) {
    if (protectedMode) {
      const card = canonicalCardsByVisitorId.get(profile.visitorId);

      if (!card ||
          card.visitorId !== profile.visitorId ||
          card.assignedTo !== profile.assignedTo ||
          card.lastFollowupAssignedAt !== profile.lastFollowupAssignedAt ||
          card.followupResolved ||
          !(await mayExposeCommittedCareAssignment(profile))) {
        continue;
      }
    }

    verifiedProfiles.push(profile);
  }

  const summaryProfiles = verifiedProfiles
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
