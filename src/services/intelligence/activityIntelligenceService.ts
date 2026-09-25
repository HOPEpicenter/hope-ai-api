import {
  OPPORTUNITY_SEGMENTS,
  toOpportunityDrilldown
} from "./opportunitySegments";
import type { FormationEvent } from "../../contracts/formationEvent.v1";
import {
  buildFormationAnalytics,
  type FormationAnalytics
} from "../../domain/formation/formation.analytics";
import {
  getCoachingForMember,
  type FormationCoaching
} from "../../domain/formation/formation.coaching";
import {
  mapFormationProfileReplayToAlerts
} from "../../domain/alerts/formationAlert.rules";
import {
  FormationIntelligence,
  type FormationRecommendation
} from "../../domain/formation/formation.intelligence";
import { FormationProfileIndex } from "../../domain/formation/formationProfile.index";
import {
  buildFormationMilestones,
  type FormationMilestonesCollection
} from "../../domain/formation/formation.milestones";
import {
  buildFormationTimeline,
  type FormationTimelineCollection
} from "../../domain/formation/formation.timeline";
import {
  PastoralInsightsEngine,
  type FormationInsights
} from "./pastoralInsightsEngine";
import {
  buildFormationBriefingCard,
  type FormationBriefingCard
} from "./morningBriefingService";
import type { RaiseAlertCommand } from "../../domain/alerts/alert.commands";
import type { CareEvent } from "../../domain/care/care.events";
import { CareProfileIndex } from "../../domain/care/careProfile.index";
import type { CareProfile } from "../../domain/care/careProfile.projection";
import { buildCareTimeline, type CareTimelineCollection } from "../../domain/care/care.timeline";
import { buildCareMilestones, type CareMilestonesCollection } from "../../domain/care/care.milestones";
import { buildCareInsights, type CareInsights } from "../../domain/care/care.insights";
import { buildCareRecommendation, type CareRecommendation } from "../../domain/care/care.intelligence";
import { buildCareAlerts, type CareAlert } from "../../domain/care/care.alerts";
import { buildCareAnalytics, type CareAnalytics } from "../../domain/care/care.analytics";
import { getCareCoaching, type CareCoaching } from "../../domain/care/care.coaching";
import type { ServingEvent } from "../../domain/serving/serving.events";
import { ServingProfileIndex } from "../../domain/serving/servingProfile.index";
import type { ServingProfile } from "../../domain/serving/servingProfile.projection";
import { buildServingTimeline, type ServingTimelineCollection } from "../../domain/serving/serving.timeline";
import { buildServingMilestones, type ServingMilestonesCollection } from "../../domain/serving/serving.milestones";
import { buildServingInsights, type ServingInsights } from "../../domain/serving/serving.insights";
import { buildServingRecommendation, type ServingRecommendation } from "../../domain/serving/serving.intelligence";
import { buildServingAlerts, type ServingAlert } from "../../domain/serving/serving.alerts";
import { buildServingAnalytics, type ServingAnalytics } from "../../domain/serving/serving.analytics";
import { getServingCoaching, type ServingCoaching } from "../../domain/serving/serving.coaching";
import type { CommunityEvent } from "../../domain/community/community.events";
import { CommunityProfileIndex } from "../../domain/community/communityProfile.index";
import type { CommunityProfile } from "../../domain/community/communityProfile.projection";
import { buildCommunityTimeline, type CommunityTimelineCollection } from "../../domain/community/community.timeline";
import { buildCommunityMilestones, type CommunityMilestonesCollection } from "../../domain/community/community.milestones";
import { buildCommunityInsights, type CommunityInsights } from "../../domain/community/community.insights";
import { buildCommunityRecommendation, type CommunityRecommendation } from "../../domain/community/community.intelligence";
import { buildCommunityAlerts, type CommunityAlert } from "../../domain/community/community.alerts";
import { buildCommunityAnalytics, type CommunityAnalytics } from "../../domain/community/community.analytics";
import { getCommunityCoaching, type CommunityCoaching } from "../../domain/community/community.coaching";
import type { GivingEvent } from "../../domain/giving/giving.events";
import { GivingProfileIndex } from "../../domain/giving/givingProfile.index";
import type { GivingProfile } from "../../domain/giving/givingProfile.projection";
import { buildGivingTimeline, type GivingTimelineCollection } from "../../domain/giving/giving.timeline";
import { buildGivingMilestones, type GivingMilestonesCollection } from "../../domain/giving/giving.milestones";
import { buildGivingInsights, type GivingInsights } from "../../domain/giving/giving.insights";
import { buildGivingRecommendation, type GivingRecommendation } from "../../domain/giving/giving.intelligence";
import { buildGivingAlerts, type GivingAlert } from "../../domain/giving/giving.alerts";
import { buildGivingAnalytics, type GivingAnalytics } from "../../domain/giving/giving.analytics";
import { getGivingCoaching, type GivingCoaching } from "../../domain/giving/giving.coaching";
import type { AttendanceEvent } from "../../domain/attendance/attendance.events";
import { AttendanceProfileIndex } from "../../domain/attendance/attendanceProfile.index";
import type { AttendanceProfile } from "../../domain/attendance/attendanceProfile.projection";
import { buildAttendanceTimeline, type AttendanceTimelineCollection } from "../../domain/attendance/attendance.timeline";
import { buildAttendanceMilestones, type AttendanceMilestonesCollection } from "../../domain/attendance/attendance.milestones";
import { buildAttendanceInsights, type AttendanceInsights } from "../../domain/attendance/attendance.insights";
import { buildAttendanceRecommendation, type AttendanceRecommendation } from "../../domain/attendance/attendance.intelligence";
import { buildAttendanceAlerts, type AttendanceAlert } from "../../domain/attendance/attendance.alerts";
import { buildAttendanceAnalytics, type AttendanceAnalytics } from "../../domain/attendance/attendance.analytics";
import { getAttendanceCoaching, type AttendanceCoaching } from "../../domain/attendance/attendance.coaching";
import type { EngagementEvent } from "../../domain/engagement/engagement.events";
import { EngagementProfileIndex } from "../../domain/engagement/engagementProfile.index";
import type { EngagementProfile } from "../../domain/engagement/engagementProfile.projection";
import { buildEngagementTimeline, type EngagementTimelineCollection } from "../../domain/engagement/engagement.timeline";
import { buildEngagementMilestones, type EngagementMilestonesCollection } from "../../domain/engagement/engagement.milestones";
import { buildEngagementInsights, type EngagementInsights } from "../../domain/engagement/engagement.insights";
import { buildEngagementRecommendation, type EngagementRecommendation } from "../../domain/engagement/engagement.intelligence";
import { buildEngagementAlerts, type EngagementAlert } from "../../domain/engagement/engagement.alerts";
import { buildEngagementAnalytics, type EngagementAnalytics } from "../../domain/engagement/engagement.analytics";
import { getEngagementCoaching, type EngagementCoaching } from "../../domain/engagement/engagement.coaching";
import { buildMinistryHealthAggregate } from "../../domain/ministryHealth/ministryHealth.aggregate";
import { buildMinistryHealthAnalytics, type MinistryHealthAnalytics } from "../../domain/ministryHealth/ministryHealth.analytics";
import { buildMinistryHealthInsights, type MinistryHealthInsight } from "../../domain/ministryHealth/ministryHealth.insights";
import { buildMinistryHealthCoaching, type MinistryHealthCoaching } from "../../domain/ministryHealth/ministryHealth.coaching";
import { buildMinistryHealthTimeline } from "../../domain/ministryHealth/ministryHealth.timeline";
import { MemberJourneyService } from "../../domain/memberJourney/memberJourney.service";
import { buildAiFeatureVector, type AiFeatureVector } from "../../domain/aiModeling/ai.features";
import { buildAiPredictions, type AiPredictions } from "../../domain/aiModeling/ai.modeling";
import { buildAiInsights, type AiInsight } from "../../domain/aiModeling/ai.insights";
import { buildAiRecommendations, type AiRecommendation } from "../../domain/aiModeling/ai.recommendations";
import {
  buildPredictiveLeadershipIntelligence,
  buildPredictiveMemberIntelligence,
  type PredictiveLeadershipIntelligence,
  type PredictiveMemberIntelligence
} from "../../domain/predictiveIntelligence/predictive.report";
import { defaultPastoralTeamProfiles } from "../../config/pastoralTeamProfiles";
import { assignPastoralWorkload, type PastoralWorkloadAssignment } from "../../domain/workloadOptimization/workload.assignment";
import { buildPastoralWorkloadInputs } from "../../domain/workloadOptimization/workload.inputs";
import { rankPastoralWorkload, type PastoralWorkloadRanking } from "../../domain/workloadOptimization/workload.ranking";
import { buildPastoralWorkloadLeadershipSummary, type PastoralWorkloadLeadershipSummary } from "../../domain/workloadOptimization/workload.report";
import { schedulePastoralWorkload, type PastoralWorkloadSchedule } from "../../domain/workloadOptimization/workload.schedule";
import { buildPastoralBriefingInputs, type PastoralBriefingTimelineEvent } from "../../domain/pastoralBriefing/pastoralBriefing.inputs";
import { buildDailyPastoralBriefing, type DailyPastoralBriefing } from "../../domain/pastoralBriefing/pastoralBriefing.daily";
import { buildWeeklyPastoralBriefing, type WeeklyPastoralBriefing } from "../../domain/pastoralBriefing/pastoralBriefing.weekly";
import { buildEventPastoralBriefings, type PastoralBriefingEvent } from "../../domain/pastoralBriefing/pastoralBriefing.events";
export type ActivityOperationalHealthStatus = "healthy" | "watch" | "attention";

export type ActivityCareLoadSummary = {
  totalCandidates: number;
  urgentCount: number;
  staleCount: number;
  escalationCount: number;
  assignedCount: number;
  unassignedCount: number;
  ownedCount: number;
  queueCount: number;
};

export type ActivityFollowupStats = {
  total: number;
  resolved: number;
  escalated: number;
  overdue: number;
  atRisk: number;
  onTrack: number;
};

export type ActivityFormationProjectionInput = {
  stage?: string | null;
  assignedTo?: string | null;
  lastNextStepAt?: string | null;
  lastNextStepCompletedAt?: string | null;
  lastFollowupOutcome?: string | null;
  lastFollowupOutcomeAt?: string | null;
  groups?: unknown;
  groupsJson?: string | null;
};

export type ActivityFormationJourneySummary = {
  guest: number;
  connected: number;
  growing: number;
  serving: number;
  member: number;
};

export type ActivityFormationMilestoneSummary = {
  nextStepSelected: number;
  nextStepCompleted: number;
  connectedOutcomes: number;
  activeCareRelationships: number;
  groupParticipation: number;
};

export type ActivityFormationCohortSummary = {
  connectedWithoutNextStep: number;
  connectedWithoutCareOwner: number;
  nextStepSelectedNotCompleted: number;
  activeCareWithoutOutcome: number;
};

export type ActivityFormationOpportunity = {
  key:
    | "CONNECTED_WITHOUT_NEXT_STEP"
    | "ACTIVE_CARE_WITHOUT_OUTCOME"
    | "NEXT_STEP_SELECTED_NOT_COMPLETED"
    | "CONNECTED_WITHOUT_CARE_OWNER";
  label: string;
  count: number;
  priority: "high" | "medium" | "low";
  drilldown: {
    surface: "formation-profiles" | "followups" | "care-queue";
    segment: string;
    href: string;
  };
};

export type ActivityFormationOpportunitySummary = {
  highestPriority: ActivityFormationOpportunity | null;
  items: ActivityFormationOpportunity[];
};

export type ActivityFormationSummary = {
  totalProfiles: number;
  byStage: Record<string, number>;
  projectedJourney: ActivityFormationJourneySummary;
  milestoneSignals: ActivityFormationMilestoneSummary;
  cohorts: ActivityFormationCohortSummary;
  opportunities: ActivityFormationOpportunitySummary;
};

export type ActivityIntelligenceInput = {
  careSummary: ActivityCareLoadSummary;
  followupStats: ActivityFollowupStats;
  formationProfiles: ActivityFormationProjectionInput[];
  formationEvents?: readonly FormationEvent[];
  careEvents?: readonly CareEvent[];
  servingEvents?: readonly ServingEvent[];
  communityEvents?: readonly CommunityEvent[];
  givingEvents?: readonly GivingEvent[];
  attendanceEvents?: readonly AttendanceEvent[];
  engagementCycleEvents?: readonly EngagementEvent[];
  generatedAt?: string;
};

export type ActivityIntelligenceResult = {
  generatedAt: string;
  operationalHealth: {
    status: ActivityOperationalHealthStatus;
    reasons: string[];
  };
  careLoad: ActivityCareLoadSummary;
  followups: ActivityFollowupStats;
  formation: ActivityFormationSummary;
  formationInsights: FormationInsights[];
  formationRecommendations: FormationRecommendation[];
  formationAlerts: RaiseAlertCommand[];
  formationBriefing: FormationBriefingCard;
  formationTimeline: FormationTimelineCollection[];
  formationMilestones: FormationMilestonesCollection[];
  formationAnalytics: FormationAnalytics;
  formationCoaching: FormationCoaching[];
  careProfile: CareProfile[];
  careTimeline: CareTimelineCollection[];
  careMilestones: CareMilestonesCollection[];
  careInsights: CareInsights[];
  careRecommendations: CareRecommendation[];
  careAlerts: CareAlert[];
  careAnalytics: CareAnalytics;
  careCoaching: CareCoaching[];
  servingProfile: ServingProfile[];
  servingTimeline: ServingTimelineCollection[];
  servingMilestones: ServingMilestonesCollection[];
  servingInsights: ServingInsights[];
  servingRecommendations: ServingRecommendation[];
  servingAlerts: ServingAlert[];
  servingAnalytics: ServingAnalytics;
  servingCoaching: ServingCoaching[];
  communityProfile: CommunityProfile[];
  communityTimeline: CommunityTimelineCollection[];
  communityMilestones: CommunityMilestonesCollection[];
  communityInsights: CommunityInsights[];
  communityRecommendations: CommunityRecommendation[];
  communityAlerts: CommunityAlert[];
  communityAnalytics: CommunityAnalytics;
  communityCoaching: CommunityCoaching[];
  givingProfile: GivingProfile[];
  givingTimeline: GivingTimelineCollection[];
  givingMilestones: GivingMilestonesCollection[];
  givingInsights: GivingInsights[];
  givingRecommendations: GivingRecommendation[];
  givingAlerts: GivingAlert[];
  givingAnalytics: GivingAnalytics;
  givingCoaching: GivingCoaching[];
  attendanceProfile: AttendanceProfile[];
  attendanceTimeline: AttendanceTimelineCollection[];
  attendanceMilestones: AttendanceMilestonesCollection[];
  attendanceInsights: AttendanceInsights[];
  attendanceRecommendations: AttendanceRecommendation[];
  attendanceAlerts: AttendanceAlert[];
  attendanceAnalytics: AttendanceAnalytics;
  attendanceCoaching: AttendanceCoaching[];
  engagementProfile: EngagementProfile[];
  engagementTimeline: EngagementTimelineCollection[];
  engagementMilestones: EngagementMilestonesCollection[];
  engagementInsights: EngagementInsights[];
  engagementRecommendations: EngagementRecommendation[];
  engagementAlerts: EngagementAlert[];
  engagementAnalytics: EngagementAnalytics;
  engagementCoaching: EngagementCoaching[];
  ministryHealthSummary: ReturnType<typeof buildMinistryHealthAggregate>["ministryHealthSummary"] & {
    scores: ReturnType<typeof buildMinistryHealthAggregate>["ministryHealthScores"];
    alerts: ReturnType<typeof buildMinistryHealthAggregate>["ministryHealthAlerts"];
    trends: ReturnType<typeof buildMinistryHealthAggregate>["ministryHealthTrends"];
  };
  ministryHealthAnalytics: MinistryHealthAnalytics;
  ministryHealthInsights: MinistryHealthInsight[];
  ministryHealthCoaching: MinistryHealthCoaching;
  /** Aggregate analytics are modeled as one deterministic global member. */
  aiFeatures: AiFeatureVector[];
  aiPredictions: AiPredictions[];
  aiInsights: AiInsight[];
  aiRecommendations: AiRecommendation[];
  predictiveMemberIntelligence: PredictiveMemberIntelligence[];
  predictiveLeadershipIntelligence: PredictiveLeadershipIntelligence;
  memberJourneySummary: ReturnType<MemberJourneyService["build"]>["narrative"];
  memberJourneyInsights: ReturnType<MemberJourneyService["build"]>["insights"];
  memberJourneyRecommendations: ReturnType<MemberJourneyService["build"]>["recommendations"];
  workloadMemberPlan: PastoralWorkloadSchedule | null;
  workloadPastorPlans: PastoralWorkloadSchedule[];
  workloadLeadershipSummary: PastoralWorkloadLeadershipSummary;
  dailyPastoralBriefing: DailyPastoralBriefing;
  weeklyPastoralBriefing: WeeklyPastoralBriefing;
  eventPastoralBriefings: PastoralBriefingEvent[];
};

const CONNECTED_OUTCOMES = new Set([
  "connected",
  "will_visit",
  "visiting",
  "attending",
  "next_step_taken",
  "joined_group",
  "member_class",
  "baptism_class"
]);

function addStage(byStage: Record<string, number>, rawStage: unknown): void {
  const stage = String(rawStage ?? "Unknown").trim() || "Unknown";
  byStage[stage] = (byStage[stage] ?? 0) + 1;
}

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function normalizeOutcome(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePastoralTimelineEvents(
  domain: PastoralBriefingTimelineEvent["domain"],
  timelines: readonly { memberId: string; items: readonly { occurredAt: string; type: string }[] }[]
): PastoralBriefingTimelineEvent[] {
  return timelines.flatMap((timeline) => timeline.items.map((item) => ({
    memberId: timeline.memberId,
    occurredAt: item.occurredAt,
    domain,
    type: item.type,
    summary: `${domain} activity: ${item.type}.`
  })));
}

function hasGroupParticipation(profile: ActivityFormationProjectionInput): boolean {
  if (Array.isArray(profile.groups) && profile.groups.length > 0) {
    return true;
  }

  const groupsJson = String(profile.groupsJson ?? "").trim();
  if (!groupsJson) {
    return false;
  }

  try {
    const groups = JSON.parse(groupsJson);
    return Array.isArray(groups) && groups.length > 0;
  } catch {
    return false;
  }
}

function buildFormationOpportunities(
  cohorts: ActivityFormationCohortSummary
): ActivityFormationOpportunitySummary {
  const countBySegment: Record<string, number> = {
    "connected-without-next-step": cohorts.connectedWithoutNextStep,
    "active-care-without-outcome": cohorts.activeCareWithoutOutcome,
    "next-step-selected-not-completed": cohorts.nextStepSelectedNotCompleted,
    "connected-without-care-owner": cohorts.connectedWithoutCareOwner
  };

  const items = OPPORTUNITY_SEGMENTS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    count: countBySegment[definition.segment] ?? 0,
    priority: definition.priority,
    drilldown: toOpportunityDrilldown(definition)
  })) satisfies ActivityFormationOpportunity[];

  const filtered = items.filter((item) => item.count > 0);

  return {
    highestPriority: filtered[0] ?? null,
    items: filtered
  };
}

function buildFormationSummary(
  profiles: ActivityFormationProjectionInput[]
): ActivityFormationSummary {
  const byStage: Record<string, number> = {};
  const projectedJourney: ActivityFormationJourneySummary = {
    guest: 0,
    connected: 0,
    growing: 0,
    serving: 0,
    member: 0
  };
  const milestoneSignals: ActivityFormationMilestoneSummary = {
    nextStepSelected: 0,
    nextStepCompleted: 0,
    connectedOutcomes: 0,
    activeCareRelationships: 0,
    groupParticipation: 0
  };

  const cohorts: ActivityFormationCohortSummary = {
    connectedWithoutNextStep: 0,
    connectedWithoutCareOwner: 0,
    nextStepSelectedNotCompleted: 0,
    activeCareWithoutOutcome: 0
  };

  for (const profile of profiles) {
    addStage(byStage, profile.stage);

    const stage = String(profile.stage ?? "").trim();
    const outcome = normalizeOutcome(profile.lastFollowupOutcome);
    const hasNextStep = hasText(profile.lastNextStepAt);
    const hasCompletedNextStep = hasText(profile.lastNextStepCompletedAt);
    const hasConnectedOutcome =
      hasText(profile.lastFollowupOutcomeAt) &&
      CONNECTED_OUTCOMES.has(outcome);
    const hasCareOwner = hasText(profile.assignedTo);
    const hasGroups = hasGroupParticipation(profile);

    if (stage === "Connected" && !hasNextStep) {
      cohorts.connectedWithoutNextStep++;
    }

    if (stage === "Connected" && !hasCareOwner) {
      cohorts.connectedWithoutCareOwner++;
    }

    if (hasNextStep && !hasCompletedNextStep) {
      cohorts.nextStepSelectedNotCompleted++;
    }

    if (hasCareOwner && !hasText(profile.lastFollowupOutcomeAt)) {
      cohorts.activeCareWithoutOutcome++;
    }

    if (hasNextStep) {
      milestoneSignals.nextStepSelected++;
    }

    if (hasCompletedNextStep) {
      milestoneSignals.nextStepCompleted++;
    }

    if (hasConnectedOutcome) {
      milestoneSignals.connectedOutcomes++;
    }

    if (hasCareOwner) {
      milestoneSignals.activeCareRelationships++;
    }

    if (hasGroups) {
      milestoneSignals.groupParticipation++;
    }

    if (stage === "Guest" || stage === "Visitor" || stage === "Unknown" || !stage) {
      projectedJourney.guest++;
    }

    if (stage === "Connected" || hasConnectedOutcome || hasNextStep) {
      projectedJourney.connected++;
    }

    if (hasCompletedNextStep || hasGroups) {
      projectedJourney.growing++;
    }

    if (hasGroups || outcome === "joined_group") {
      projectedJourney.serving++;
    }

    if (outcome === "member_class") {
      projectedJourney.member++;
    }
  }

  return {
    totalProfiles: profiles.length,
    byStage,
    projectedJourney,
    milestoneSignals,
    cohorts,
    opportunities: buildFormationOpportunities(cohorts)
  };
}

export function buildActivityIntelligence(
  input: ActivityIntelligenceInput
): ActivityIntelligenceResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reasons: string[] = [];

  if (input.followupStats.overdue > 0) {
    reasons.push(`${input.followupStats.overdue} overdue followup(s)`);
  }

  if (input.careSummary.escalationCount > 0) {
    reasons.push(`${input.careSummary.escalationCount} care escalation(s)`);
  }

  if (input.careSummary.urgentCount > 0) {
    reasons.push(`${input.careSummary.urgentCount} urgent care candidate(s)`);
  }

  if (input.careSummary.staleCount > 0) {
    reasons.push(`${input.careSummary.staleCount} stale care candidate(s)`);
  }

  if (input.followupStats.atRisk > 0) {
    reasons.push(`${input.followupStats.atRisk} at-risk followup(s)`);
  }

  const status: ActivityOperationalHealthStatus =
    input.followupStats.overdue > 0 ||
    input.careSummary.escalationCount > 0 ||
    input.careSummary.urgentCount > 0
      ? "attention"
      : input.careSummary.staleCount > 0 || input.followupStats.atRisk > 0
        ? "watch"
        : "healthy";
  const formationEvents = (input.formationEvents ?? [])
    .slice()
    .sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt)
      || left.eventId.localeCompare(right.eventId)
    );
  const formationProfileIndex = new FormationProfileIndex();
  formationProfileIndex.replayEvents(formationEvents);
  const formationProfiles = formationProfileIndex.getAllProfiles();
  const pastoralInsights = new PastoralInsightsEngine(formationProfileIndex);
  const formationIntelligence = new FormationIntelligence();
  const formationInsights = pastoralInsights.getAllFormationInsights();
  const formationRecommendations = formationProfiles
    .map((profile) => formationIntelligence.analyze(profile).recommendedNextStep);
  const formationAlerts = formationProfiles
    .flatMap((profile) => mapFormationProfileReplayToAlerts(
      formationProfileIndex,
      profile.memberId
    ));
  const formationTimeline = formationProfiles.map((profile) => ({
    memberId: profile.memberId,
    items: buildFormationTimeline(profile, formationEvents)
  }));
  const formationMilestones = formationTimeline.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildFormationMilestones(timeline.items)
  }));
  const formationCoaching = formationProfiles.map((profile, index) =>
    getCoachingForMember(
      profile,
      formationTimeline[index]!.items,
      formationMilestones[index]!.milestones,
      formationInsights[index]!,
      formationRecommendations[index]!
    )
  );
  const careProfileIndex = new CareProfileIndex();
  careProfileIndex.replayEvents(input.careEvents ?? []);
  const careProfile = careProfileIndex.getAllProfiles();
  const careTimeline = careProfile.map((profile) => ({
    memberId: profile.memberId,
    items: buildCareTimeline(profile, careProfileIndex.getEvents(profile.memberId))
  }));
  const careMilestones = careTimeline.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildCareMilestones(timeline.items)
  }));
  const careInsights = careProfile.map(buildCareInsights);
  const careRecommendations = careProfile.map((profile, index) =>
    buildCareRecommendation(profile, careInsights[index]!)
  );
  const careAlerts = careProfile.flatMap((profile, index) =>
    buildCareAlerts(profile, careInsights[index]!)
  );
  const careAnalytics = buildCareAnalytics(careProfile);
  const careCoaching = careProfile.map((profile, index) =>
    getCareCoaching(
      profile,
      careMilestones[index]!.milestones,
      careInsights[index]!,
      careRecommendations[index]!
    )
  );
  const servingProfileIndex = new ServingProfileIndex();
  servingProfileIndex.replayEvents(input.servingEvents ?? []);
  const servingProfile = servingProfileIndex.getAllProfiles();
  const servingTimeline = servingProfile.map((profile) => ({
    memberId: profile.memberId,
    items: buildServingTimeline(profile, servingProfileIndex.getEvents(profile.memberId))
  }));
  const servingMilestones = servingTimeline.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildServingMilestones(timeline.items)
  }));
  const servingInsights = servingProfile.map(buildServingInsights);
  const servingRecommendations = servingProfile.map((profile, index) =>
    buildServingRecommendation(profile, servingInsights[index]!)
  );
  const servingAlerts = servingProfile.flatMap((profile, index) =>
    buildServingAlerts(profile, servingInsights[index]!)
  );
  const servingAnalytics = buildServingAnalytics(servingProfile);
  const servingCoaching = servingProfile.map((profile, index) =>
    getServingCoaching(
      profile,
      servingMilestones[index]!.milestones,
      servingInsights[index]!,
      servingRecommendations[index]!
    )
  );
  const communityProfileIndex = new CommunityProfileIndex();
  communityProfileIndex.replayEvents(input.communityEvents ?? []);
  const communityProfile = communityProfileIndex.getAllProfiles();
  const communityTimeline = communityProfile.map((profile) => ({
    memberId: profile.memberId,
    items: buildCommunityTimeline(profile, communityProfileIndex.getEvents(profile.memberId))
  }));
  const communityMilestones = communityTimeline.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildCommunityMilestones(timeline.items)
  }));
  const communityInsights = communityProfile.map(buildCommunityInsights);
  const communityRecommendations = communityProfile.map((profile, index) =>
    buildCommunityRecommendation(profile, communityInsights[index]!)
  );
  const communityAlerts = communityProfile.flatMap((profile, index) =>
    buildCommunityAlerts(profile, communityInsights[index]!)
  );
  const communityAnalytics = buildCommunityAnalytics(communityProfile);
  const communityCoaching = communityProfile.map((profile, index) =>
    getCommunityCoaching(
      profile,
      communityMilestones[index]!.milestones,
      communityInsights[index]!,
      communityRecommendations[index]!
    )
  );
  const givingProfileIndex = new GivingProfileIndex();
  givingProfileIndex.replayEvents(input.givingEvents ?? []);
  const givingProfile = givingProfileIndex.getAllProfiles();
  const givingTimeline = givingProfile.map((profile) => ({
    memberId: profile.memberId,
    items: buildGivingTimeline(profile, givingProfileIndex.getEvents(profile.memberId))
  }));
  const givingMilestones = givingTimeline.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildGivingMilestones(timeline.items)
  }));
  const givingInsights = givingProfile.map(buildGivingInsights);
  const givingRecommendations = givingProfile.map((profile, index) =>
    buildGivingRecommendation(profile, givingInsights[index]!)
  );
  const givingAlerts = givingProfile.flatMap((profile, index) =>
    buildGivingAlerts(profile, givingInsights[index]!)
  );
  const givingAnalytics = buildGivingAnalytics(givingProfile);
  const givingCoaching = givingProfile.map((profile, index) =>
    getGivingCoaching(profile, givingMilestones[index]!.milestones, givingInsights[index]!, givingRecommendations[index]!)
  );
  const attendanceProfileIndex = new AttendanceProfileIndex();
  attendanceProfileIndex.replayEvents(input.attendanceEvents ?? []);
  const attendanceProfile = attendanceProfileIndex.getAllProfiles();
  const attendanceTimeline = attendanceProfile.map((profile) => ({
    memberId: profile.memberId,
    items: buildAttendanceTimeline(profile, attendanceProfileIndex.getEvents(profile.memberId))
  }));
  const attendanceMilestones = attendanceTimeline.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildAttendanceMilestones(timeline.items)
  }));
  const attendanceInsights = attendanceProfile.map(buildAttendanceInsights);
  const attendanceRecommendations = attendanceProfile.map((profile, index) =>
    buildAttendanceRecommendation(profile, attendanceInsights[index]!)
  );
  const attendanceAlerts = attendanceProfile.flatMap((profile, index) =>
    buildAttendanceAlerts(profile, attendanceInsights[index]!)
  );
  const attendanceAnalytics = buildAttendanceAnalytics(attendanceProfile);
  const attendanceCoaching = attendanceProfile.map((profile, index) =>
    getAttendanceCoaching(profile, attendanceMilestones[index]!.milestones, attendanceInsights[index]!, attendanceRecommendations[index]!)
  );
  const engagementProfileIndex = new EngagementProfileIndex();
  engagementProfileIndex.replayEvents(input.engagementCycleEvents ?? []);
  const engagementProfile = engagementProfileIndex.getAllProfiles();
  const engagementTimeline = engagementProfile.map((profile) => ({
    memberId: profile.memberId,
    items: buildEngagementTimeline(profile, engagementProfileIndex.getEvents(profile.memberId))
  }));
  const engagementMilestones = engagementTimeline.map((timeline) => ({
    memberId: timeline.memberId,
    milestones: buildEngagementMilestones(timeline.items)
  }));
  const engagementInsights = engagementProfile.map(buildEngagementInsights);
  const engagementRecommendations = engagementProfile.map((profile, index) =>
    buildEngagementRecommendation(profile, engagementInsights[index]!)
  );
  const engagementAlerts = engagementProfile.flatMap((profile, index) =>
    buildEngagementAlerts(profile, engagementInsights[index]!)
  );
  const engagementAnalytics = buildEngagementAnalytics(engagementProfile);
  const engagementCoaching = engagementProfile.map((profile, index) =>
    getEngagementCoaching(profile, engagementMilestones[index]!.milestones, engagementInsights[index]!, engagementRecommendations[index]!)
  );
  const ministryHealthAggregate = buildMinistryHealthAggregate({
    formationAnalytics: buildFormationAnalytics({ profiles: formationProfiles, timelines: formationTimeline, milestones: formationMilestones }),
    careAnalytics,
    servingAnalytics,
    communityAnalytics,
    givingAnalytics,
    attendanceAnalytics,
    engagementAnalytics
  }, generatedAt);
  const ministryHealthInsights = buildMinistryHealthInsights(ministryHealthAggregate);
  const ministryHealthAnalytics = buildMinistryHealthAnalytics(ministryHealthAggregate);
  const ministryHealthCoaching = buildMinistryHealthCoaching(ministryHealthInsights.filter(insight => insight.severity !== "info").map(insight => ({ domain: insight.domain, priority: insight.severity === "critical" ? "high" as const : "medium" as const, action: `Review ${insight.domain} workload and assign an owner.`, reason: insight.message })));
  const aiFeatures = [buildAiFeatureVector("global", {
    formationAnalytics: buildFormationAnalytics({ profiles: formationProfiles, timelines: formationTimeline, milestones: formationMilestones }),
    careAnalytics,
    servingAnalytics,
    communityAnalytics,
    givingAnalytics,
    attendanceAnalytics,
    engagementAnalytics,
    ministryHealthAnalytics
  })];
  const aiPredictions = aiFeatures.map(buildAiPredictions);
  const aiInsights = aiFeatures.flatMap((features, index) => buildAiInsights(features, aiPredictions[index]!));
  const aiRecommendations = aiPredictions.flatMap((predictions) =>
    buildAiRecommendations(predictions, aiInsights.filter((insight) => insight.memberId === predictions.memberId))
  );
  const predictiveMemberIntelligence = buildPredictiveMemberIntelligence(
    aiPredictions,
    ministryHealthAnalytics
  );
  const predictiveLeadershipIntelligence = buildPredictiveLeadershipIntelligence({
    members: predictiveMemberIntelligence,
    ministryHealthAnalytics,
    aiInsights,
    aiRecommendations
  });
  const memberJourney = new MemberJourneyService().build({
    memberId: "global",
    formationTimeline: formationTimeline as unknown as [],
    careTimeline: careTimeline as unknown as [],
    servingTimeline: servingTimeline as unknown as [],
    communityTimeline: communityTimeline as unknown as [],
    givingTimeline: givingTimeline as unknown as [],
    attendanceTimeline: attendanceTimeline as unknown as [],
    engagementTimeline: engagementTimeline as unknown as [],
    ministryHealthTimeline: buildMinistryHealthTimeline(ministryHealthAggregate),
    aiPredictions,
    predictiveMemberIntelligence
  }, generatedAt);
  const workloadInputs = buildPastoralWorkloadInputs({
    predictiveMemberIntelligence,
    memberJourneySummary: {
      memberId: "global",
      tone: memberJourney.narrative.tone === "attentive" ? "concerned" : memberJourney.narrative.tone === "pastoral" ? "balanced" : "encouraging"
    },
    careCoaching,
    formationCoaching,
    servingCoaching,
    communityCoaching,
    givingCoaching,
    attendanceCoaching,
    engagementCoaching,
    ministryHealthAnalytics
  });
  const workloadRankings = rankPastoralWorkload(workloadInputs);
  const workloadAssignments = assignPastoralWorkload(workloadRankings, defaultPastoralTeamProfiles);
  const workloadSchedules = schedulePastoralWorkload(workloadAssignments);
  const pastoralBriefingInputs = buildPastoralBriefingInputs({
    generatedAt,
    predictiveMemberIntelligence,
    workloadMemberPlans: workloadSchedules,
    memberJourneyNarrative: memberJourney.narrative,
    memberJourneySummary: memberJourney.narrative.summary,
    ministryHealthSummary: ministryHealthAggregate.ministryHealthSummary,
    ministryHealthAnalytics,
    careCoaching,
    formationCoaching,
    servingCoaching,
    communityCoaching,
    givingCoaching,
    attendanceCoaching,
    engagementCoaching,
    recentTimelineEvents: [
      ...normalizePastoralTimelineEvents("formation", formationTimeline),
      ...normalizePastoralTimelineEvents("care", careTimeline),
      ...normalizePastoralTimelineEvents("serving", servingTimeline),
      ...normalizePastoralTimelineEvents("community", communityTimeline),
      ...normalizePastoralTimelineEvents("giving", givingTimeline),
      ...normalizePastoralTimelineEvents("attendance", attendanceTimeline),
      ...normalizePastoralTimelineEvents("engagement", engagementTimeline)
    ]
  });

  return {
    generatedAt,
    operationalHealth: {
      status,
      reasons
    },
    careLoad: input.careSummary,
    followups: input.followupStats,
    formation: buildFormationSummary(input.formationProfiles),
    formationInsights,
    formationRecommendations,
    formationAlerts,
    formationBriefing: buildFormationBriefingCard(formationProfileIndex),
    formationTimeline,
    formationMilestones,
    formationAnalytics: buildFormationAnalytics({
      profiles: formationProfiles,
      timelines: formationTimeline,
      milestones: formationMilestones
    }),
    formationCoaching,
    careProfile,
    careTimeline,
    careMilestones,
    careInsights,
    careRecommendations,
    careAlerts,
    careAnalytics,
    careCoaching,
    servingProfile,
    servingTimeline,
    servingMilestones,
    servingInsights,
    servingRecommendations,
    servingAlerts,
    servingAnalytics,
    servingCoaching,
    communityProfile,
    communityTimeline,
    communityMilestones,
    communityInsights,
    communityRecommendations,
    communityAlerts,
    communityAnalytics,
    communityCoaching,
    givingProfile,
    givingTimeline,
    givingMilestones,
    givingInsights,
    givingRecommendations,
    givingAlerts,
    givingAnalytics,
    givingCoaching,
    attendanceProfile,
    attendanceTimeline,
    attendanceMilestones,
    attendanceInsights,
    attendanceRecommendations,
    attendanceAlerts,
    attendanceAnalytics,
    attendanceCoaching,
    engagementProfile,
    engagementTimeline,
    engagementMilestones,
    engagementInsights,
    engagementRecommendations,
    engagementAlerts,
    engagementAnalytics,
    engagementCoaching,
    ministryHealthSummary: {
      ...ministryHealthAggregate.ministryHealthSummary,
      scores: ministryHealthAggregate.ministryHealthScores,
      alerts: ministryHealthAggregate.ministryHealthAlerts,
      trends: ministryHealthAggregate.ministryHealthTrends
    },
    ministryHealthAnalytics,
    ministryHealthInsights,
    ministryHealthCoaching,
    aiFeatures,
    aiPredictions,
    aiInsights,
    aiRecommendations,
    predictiveMemberIntelligence,
    predictiveLeadershipIntelligence,
    memberJourneySummary: memberJourney.narrative,
    memberJourneyInsights: memberJourney.insights,
    memberJourneyRecommendations: memberJourney.recommendations,
    workloadMemberPlan: workloadSchedules.find((plan) => plan.memberId === "global") ?? null,
    workloadPastorPlans: workloadSchedules,
    workloadLeadershipSummary: buildPastoralWorkloadLeadershipSummary(workloadAssignments),
    dailyPastoralBriefing: buildDailyPastoralBriefing(pastoralBriefingInputs),
    weeklyPastoralBriefing: buildWeeklyPastoralBriefing(pastoralBriefingInputs),
    eventPastoralBriefings: buildEventPastoralBriefings(pastoralBriefingInputs)
  };
}


