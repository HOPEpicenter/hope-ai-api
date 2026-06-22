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
  recommendedActionReason: string;
  resolutionField: string;
  resolutionReason: string;
};

export type CanonicalOpportunityNarrative = {
  segment: string;
  label: string;
  priority: OpportunitySegmentDefinition["priority"];
  surface: OpportunitySegmentDefinition["surface"];
  headline: string;
  summary: string;
  visitor: {
    visitorId: string;
    displayName: string | null;
  };
  recommendedAction: {
    label: string;
    reason: string;
  };
  resolution: {
    status: "open";
    resolvedWhen: string;
    reason: string;
  };
  evidence: {
    stage: unknown;
    assignedTo: unknown;
    lastEventType: unknown;
    lastEventAt: unknown;
    lastFollowupOutcome: unknown;
    lastFollowupOutcomeAt: unknown;
    lastNextStepAt: unknown;
    lastNextStepCompletedAt: unknown;
  };
};

export const OPPORTUNITY_SEGMENTS: OpportunitySegmentDefinition[] = [
  {
    key: "CONNECTED_WITHOUT_NEXT_STEP",
    segment: "connected-without-next-step",
    label: "Connected people without next step",
    priority: "high",
    surface: "formation-profiles",
    href: "/formation-profiles?segment=connected-without-next-step",
    recommendedActionLabel: "Select next step",
    recommendedActionReason: "Connected profile has engagement activity but no next-step milestone.",
    resolutionField: "lastNextStepAt",
    resolutionReason: "Opportunity closes when a next-step milestone is recorded."
  },
  {
    key: "ACTIVE_CARE_WITHOUT_OUTCOME",
    segment: "active-care-without-outcome",
    label: "Active care relationships without outcome",
    priority: "high",
    surface: "followups",
    href: "/followups?segment=active-care-without-outcome",
    recommendedActionLabel: "Record care outcome",
    recommendedActionReason: "Care relationship is active but no outcome has been recorded.",
    resolutionField: "lastFollowupOutcomeAt",
    resolutionReason: "Opportunity closes when a followup outcome is recorded."
  },
  {
    key: "NEXT_STEP_SELECTED_NOT_COMPLETED",
    segment: "next-step-selected-not-completed",
    label: "Next steps selected but not completed",
    priority: "medium",
    surface: "formation-profiles",
    href: "/formation-profiles?segment=next-step-selected-not-completed",
    recommendedActionLabel: "Encourage next step completion",
    recommendedActionReason: "Next step was selected but no completion milestone has been recorded.",
    resolutionField: "lastNextStepCompletedAt",
    resolutionReason: "Opportunity closes when the selected next step is completed."
  },
  {
    key: "CONNECTED_WITHOUT_CARE_OWNER",
    segment: "connected-without-care-owner",
    label: "Connected people without care owner",
    priority: "medium",
    surface: "care-queue",
    href: "/followups?segment=connected-without-care-owner",
    recommendedActionLabel: "Assign care owner",
    recommendedActionReason: "Connected profile does not currently have a care owner assigned.",
    resolutionField: "assignedTo",
    resolutionReason: "Opportunity closes when a care owner is assigned."
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

function readVisitorId(profile: any, visitor: any): string {
  return String(profile?.visitorId ?? profile?.rowKey ?? visitor?.id ?? "").trim();
}

function readDisplayName(profile: any, visitor: any, visitorId: string): string | null {
  const profileDisplayName = String(profile?.displayName ?? "").trim();
  const visitorName = String(visitor?.displayName ?? visitor?.name ?? "").trim();

  return profileDisplayName || visitorName || visitorId || null;
}

export function buildOpportunityNarrative(input: {
  profile: any;
  visitor: any;
  definition: OpportunitySegmentDefinition;
}): CanonicalOpportunityNarrative {
  const profile = input.profile ?? {};
  const visitor = input.visitor ?? {};
  const visitorId = readVisitorId(profile, visitor);
  const displayName = readDisplayName(profile, visitor, visitorId);

  const headline = displayName
    ? `${displayName}: ${input.definition.label}`
    : input.definition.label;

  return {
    segment: input.definition.segment,
    label: input.definition.label,
    priority: input.definition.priority,
    surface: input.definition.surface,
    headline,
    summary: input.definition.recommendedActionReason,
    visitor: {
      visitorId,
      displayName
    },
    recommendedAction: {
      label: input.definition.recommendedActionLabel,
      reason: input.definition.recommendedActionReason
    },
    resolution: {
      status: "open",
      resolvedWhen: input.definition.resolutionField,
      reason: input.definition.resolutionReason
    },
    evidence: {
      stage: profile.stage ?? null,
      assignedTo: profile.assignedTo ?? null,
      lastEventType: profile.lastEventType ?? null,
      lastEventAt: profile.lastEventAt ?? null,
      lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
      lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null,
      lastNextStepAt: profile.lastNextStepAt ?? null,
      lastNextStepCompletedAt: profile.lastNextStepCompletedAt ?? null
    }
  };
}

export function buildOpportunityWorklistItem(input: {
  profile: any;
  visitor: any;
  definition: OpportunitySegmentDefinition;
}) {
  const profile = input.profile ?? {};
  const visitor = input.visitor ?? {};
  const narrative = buildOpportunityNarrative({
    profile,
    visitor,
    definition: input.definition
  });

  const visitorId = narrative.visitor.visitorId;
  const displayName = narrative.visitor.displayName;

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
    recommendedAction: narrative.recommendedAction,
    resolution: narrative.resolution,
    narrative,
    href: visitorId ? `/visitors/${encodeURIComponent(visitorId)}` : null
  };
}
