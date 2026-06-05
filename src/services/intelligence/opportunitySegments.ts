export type OpportunitySegmentKey =
  | "CONNECTED_WITHOUT_NEXT_STEP"
  | "ACTIVE_CARE_WITHOUT_OUTCOME"
  | "NEXT_STEP_SELECTED_NOT_COMPLETED"
  | "CONNECTED_WITHOUT_CARE_OWNER";

export type OpportunitySegmentDefinition = {
  key: OpportunitySegmentKey;
  segment: string;
  label: string;
  priority: "high" | "medium" | "low";
  surface: "formation-profiles" | "followups" | "care-queue";
  href: string;
  recommendedActionLabel: string;
};

export const OPPORTUNITY_SEGMENTS: OpportunitySegmentDefinition[] = [
  {
    key: "CONNECTED_WITHOUT_NEXT_STEP",
    segment: "connected-without-next-step",
    label: "Connected people without next step",
    priority: "high",
    surface: "formation-profiles",
    href: "/formation-profiles?segment=connected-without-next-step",
    recommendedActionLabel: "Select next step"
  },
  {
    key: "ACTIVE_CARE_WITHOUT_OUTCOME",
    segment: "active-care-without-outcome",
    label: "Active care relationships without outcome",
    priority: "high",
    surface: "followups",
    href: "/followups?segment=active-care-without-outcome",
    recommendedActionLabel: "Record care outcome"
  },
  {
    key: "NEXT_STEP_SELECTED_NOT_COMPLETED",
    segment: "next-step-selected-not-completed",
    label: "Next steps selected but not completed",
    priority: "medium",
    surface: "formation-profiles",
    href: "/formation-profiles?segment=next-step-selected-not-completed",
    recommendedActionLabel: "Encourage next step completion"
  },
  {
    key: "CONNECTED_WITHOUT_CARE_OWNER",
    segment: "connected-without-care-owner",
    label: "Connected people without care owner",
    priority: "medium",
    surface: "care-queue",
    href: "/followups?segment=connected-without-care-owner",
    recommendedActionLabel: "Assign care owner"
  }
];

export function getOpportunitySegmentDefinition(segmentInput: unknown): OpportunitySegmentDefinition | null {
  const segment = String(segmentInput ?? "").trim();
  return OPPORTUNITY_SEGMENTS.find((item) => item.segment === segment) ?? null;
}

export function toOpportunityDrilldown(definition: OpportunitySegmentDefinition) {
  return {
    surface: definition.surface,
    segment: definition.segment,
    href: definition.href
  };
}

export function buildOpportunityWorklistItem(input: {
  profile: any;
  visitor: any;
  definition: OpportunitySegmentDefinition;
}) {
  const profile = input.profile ?? {};
  const visitor = input.visitor ?? {};
  const visitorId = String(profile.visitorId ?? profile.rowKey ?? visitor.id ?? "").trim();
  const profileDisplayName = String(profile.displayName ?? "").trim();
  const visitorName = String(visitor.displayName ?? visitor.name ?? "").trim();
  const displayName = profileDisplayName || visitorName || visitorId || null;

  return {
    visitorId,
    displayName,
    stage: profile.stage ?? null,
    assignedTo: profile.assignedTo ?? null,
    lastEventType: profile.lastEventType ?? null,
    lastEventAt: profile.lastEventAt ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null,
    lastNextStepAt: profile.lastNextStepAt ?? null,
    lastNextStepCompletedAt: profile.lastNextStepCompletedAt ?? null,
    recommendedAction: {
      label: input.definition.recommendedActionLabel
    },
    href: visitorId ? `/visitors/${encodeURIComponent(visitorId)}` : null
  };
}
