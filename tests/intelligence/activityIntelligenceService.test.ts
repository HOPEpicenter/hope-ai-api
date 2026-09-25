import assert from "assert";
import { buildActivityIntelligence } from "../../src/services/intelligence/activityIntelligenceService";
import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import type { CareEvent } from "../../src/domain/care/care.events";
import type { ServingEvent } from "../../src/domain/serving/serving.events";
import type { CommunityEvent } from "../../src/domain/community/community.events";
import type { GivingEvent } from "../../src/domain/giving/giving.events";
import type { AttendanceEvent } from "../../src/domain/attendance/attendance.events";
import type { EngagementEvent } from "../../src/domain/engagement/engagement.events";

const baseCare = {
  totalCandidates: 0,
  urgentCount: 0,
  staleCount: 0,
  escalationCount: 0,
  assignedCount: 0,
  unassignedCount: 0,
  ownedCount: 0,
  queueCount: 0
};

const baseFollowups = {
  total: 0,
  resolved: 0,
  escalated: 0,
  overdue: 0,
  atRisk: 0,
  onTrack: 0
};

{
  const careEvents: CareEvent[] = [{ eventId: "care-started", occurredAt: "2026-09-01T00:00:00.000Z", memberId: "member-care", caseId: "case-care", type: "CareCaseStarted", actorId: null, payload: { ownerId: null, priority: "high" } }];
  const result = buildActivityIntelligence({ careSummary: baseCare, followupStats: baseFollowups, formationProfiles: [], careEvents });
  assert.deepStrictEqual(result.careProfile.map((profile) => profile.memberId), ["member-care"]);
  assert.strictEqual(result.careInsights[0]?.highPriorityOpenCaseCount, 1);
  assert.strictEqual(result.careRecommendations[0]?.action, "assign_owner");
  assert.strictEqual(result.careAnalytics.totalCases, 1);
}

{
  const servingEvents: ServingEvent[] = [{ eventId: "serving-started", occurredAt: "2026-09-01T00:00:00.000Z", memberId: "member-serving", assignmentId: "assignment-serving", type: "ServingAssignmentStarted", actorId: null, payload: { roleId: null, priority: "high" } }];
  const result = buildActivityIntelligence({ careSummary: baseCare, followupStats: baseFollowups, formationProfiles: [], servingEvents });
  assert.deepStrictEqual(result.servingProfile.map((profile) => profile.memberId), ["member-serving"]);
  assert.strictEqual(result.servingInsights[0]?.highPriorityActiveAssignmentCount, 1);
  assert.strictEqual(result.servingRecommendations[0]?.action, "assign_role");
  assert.strictEqual(result.servingAnalytics.totalAssignments, 1);
  assert.strictEqual(result.servingTimeline[0]?.items[0]?.type, "ServingAssignmentStarted");
}

{
  const communityEvents: CommunityEvent[] = [{ eventId: "community-started", occurredAt: "2026-09-01T00:00:00.000Z", memberId: "member-community", engagementId: "engagement-community", type: "CommunityEngagementStarted", actorId: null, payload: { groupId: null, priority: "high" } }];
  const result = buildActivityIntelligence({ careSummary: baseCare, followupStats: baseFollowups, formationProfiles: [], communityEvents });
  assert.deepStrictEqual(result.communityProfile.map((profile) => profile.memberId), ["member-community"]);
  assert.strictEqual(result.communityInsights[0]?.highPriorityActiveEngagementCount, 1);
  assert.strictEqual(result.communityRecommendations[0]?.action, "suggest_group");
  assert.strictEqual(result.communityAnalytics.totalEngagements, 1);
  assert.strictEqual(result.communityTimeline[0]?.items[0]?.type, "CommunityEngagementStarted");
}

{
  const givingEvents: GivingEvent[] = [{ eventId: "gift-recorded", occurredAt: "2026-09-01T00:00:00.000Z", memberId: "member-giving", giftId: "gift-giving", type: "GiftRecorded", actorId: null, payload: { amount: 50, designation: "general" } }];
  const result = buildActivityIntelligence({ careSummary: baseCare, followupStats: baseFollowups, formationProfiles: [], givingEvents });
  assert.deepStrictEqual(result.givingProfile.map((profile) => profile.memberId), ["member-giving"]);
  assert.strictEqual(result.givingInsights[0]?.totalGiven, 50);
  assert.strictEqual(result.givingRecommendations[0]?.action, "continue_giving");
  assert.strictEqual(result.givingAnalytics.totalGifts, 1);
  assert.strictEqual(result.givingTimeline[0]?.items[0]?.type, "GiftRecorded");
}

{
  const attendanceEvents: AttendanceEvent[] = [{ eventId: "attendance-recorded", occurredAt: "2026-09-01T00:00:00.000Z", memberId: "member-attendance", attendanceId: "attendance-1", type: "AttendanceRecorded", actorId: null, payload: { status: "late", notes: "Traffic" } }];
  const result = buildActivityIntelligence({ careSummary: baseCare, followupStats: baseFollowups, formationProfiles: [], attendanceEvents });
  assert.deepStrictEqual(result.attendanceProfile.map((profile) => profile.memberId), ["member-attendance"]);
  assert.strictEqual(result.attendanceInsights[0]?.attendanceRate, 1);
  assert.strictEqual(result.attendanceRecommendations[0]?.action, "continue_attendance");
  assert.strictEqual(result.attendanceAnalytics.attendedCount, 1);
  assert.strictEqual(result.attendanceTimeline[0]?.items[0]?.type, "AttendanceRecorded");
}

{
  const engagementCycleEvents: EngagementEvent[] = [
    { eventId: "engagement-started", occurredAt: "2026-09-01T00:00:00.000Z", memberId: "member-engagement", engagementCycleId: "cycle-1", type: "EngagementCycleStarted", actorId: null, payload: { startedAt: "2026-09-01T00:00:00.000Z" } },
    { eventId: "engagement-touchpoint", occurredAt: "2026-09-02T00:00:00.000Z", memberId: "member-engagement", engagementCycleId: "cycle-1", type: "EngagementTouchpointAdded", actorId: null, payload: { touchpointId: "touchpoint-1", channel: "call", scoreDelta: 5 } }
  ];
  const result = buildActivityIntelligence({ careSummary: baseCare, followupStats: baseFollowups, formationProfiles: [], engagementCycleEvents });
  assert.deepStrictEqual(result.engagementProfile.map((profile) => profile.memberId), ["member-engagement"]);
  assert.strictEqual(result.engagementProfile[0]?.engagementScore, 5);
  assert.strictEqual(result.engagementInsights[0]?.engagementScore, 5);
  assert.strictEqual(result.engagementRecommendations[0]?.action, "continue_engagement");
  assert.strictEqual(result.engagementAnalytics.totalTouchpoints, 1);
  assert.strictEqual(result.engagementTimeline[0]?.items[0]?.type, "EngagementCycleStarted");
}

{
  const result = buildActivityIntelligence({
    careSummary: baseCare,
    followupStats: baseFollowups,
    formationProfiles: [
      { stage: "Guest" },
      { stage: "Connected", lastNextStepAt: "2026-01-01T00:00:00.000Z" },
      {
        stage: "Connected",
        assignedTo: "ops-user-1",
        lastNextStepAt: "2026-01-01T00:00:00.000Z",
        lastNextStepCompletedAt: "2026-01-02T00:00:00.000Z",
        lastFollowupOutcome: "connected",
        lastFollowupOutcomeAt: "2026-01-03T00:00:00.000Z",
        groups: [{ groupId: "group-1" }]
      },
      { stage: "" },
      {}
    ],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.strictEqual(result.operationalHealth.status, "healthy");
  assert.deepStrictEqual(result.operationalHealth.reasons, []);
  assert.strictEqual(result.formation.totalProfiles, 5);
  assert.strictEqual(result.formation.byStage.Guest, 1);
  assert.strictEqual(result.formation.byStage.Connected, 2);
  assert.strictEqual(result.formation.byStage.Unknown, 2);

  assert.strictEqual(result.formation.milestoneSignals.nextStepSelected, 2);
  assert.strictEqual(result.formation.milestoneSignals.nextStepCompleted, 1);
  assert.strictEqual(result.formation.milestoneSignals.connectedOutcomes, 1);
  assert.strictEqual(result.formation.milestoneSignals.activeCareRelationships, 1);
  assert.strictEqual(result.formation.milestoneSignals.groupParticipation, 1);

  assert.strictEqual(result.formation.projectedJourney.guest, 3);
  assert.strictEqual(result.formation.projectedJourney.connected, 2);
  assert.strictEqual(result.formation.projectedJourney.growing, 1);
  assert.strictEqual(result.formation.projectedJourney.serving, 1);
  assert.strictEqual(result.formation.projectedJourney.member, 0);
}

{
  const result = buildActivityIntelligence({
    careSummary: {
      ...baseCare,
      staleCount: 2
    },
    followupStats: {
      ...baseFollowups,
      atRisk: 1
    },
    formationProfiles: [],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.operationalHealth.status, "watch");
  assert.ok(result.operationalHealth.reasons.includes("2 stale care candidate(s)"));
  assert.ok(result.operationalHealth.reasons.includes("1 at-risk followup(s)"));
}

{
  const result = buildActivityIntelligence({
    careSummary: {
      ...baseCare,
      urgentCount: 1,
      escalationCount: 1
    },
    followupStats: {
      ...baseFollowups,
      overdue: 1
    },
    formationProfiles: [],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.operationalHealth.status, "attention");
  assert.ok(result.operationalHealth.reasons.includes("1 overdue followup(s)"));
  assert.ok(result.operationalHealth.reasons.includes("1 care escalation(s)"));
  assert.ok(result.operationalHealth.reasons.includes("1 urgent care candidate(s)"));
}

{
  const result = buildActivityIntelligence({
    careSummary: baseCare,
    followupStats: baseFollowups,
    formationProfiles: [
      {
        stage: "Connected",
        groupsJson: JSON.stringify([{ groupId: "group-json" }])
      },
      {
        stage: "Connected",
        groupsJson: "not-json"
      },
      {
        stage: "Connected",
        lastFollowupOutcome: "member_class",
        lastFollowupOutcomeAt: "2026-01-04T00:00:00.000Z"
      }
    ],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.formation.milestoneSignals.groupParticipation, 1);
  assert.strictEqual(result.formation.projectedJourney.growing, 1);
  assert.strictEqual(result.formation.projectedJourney.serving, 1);
  assert.strictEqual(result.formation.projectedJourney.member, 1);
  assert.ok(result.ministryHealthSummary);
  assert.ok(result.ministryHealthAnalytics);
  assert.ok(Array.isArray(result.ministryHealthInsights));
  assert.ok(result.ministryHealthCoaching);
  assert.deepStrictEqual(result.aiPredictions.map((prediction) => prediction.memberId), ["global"]);
  assert.ok(Object.values(result.aiPredictions[0]!.scores).every((score) => score >= 0 && score <= 1));
  assert.ok(result.aiInsights.length > 0);
  assert.strictEqual(result.aiRecommendations[0]?.memberId, "global");
  assert.strictEqual(result.predictiveMemberIntelligence[0]?.risk.memberId, "global");
  assert.ok(Object.values(result.predictiveMemberIntelligence[0]!.risk).filter((value) => typeof value === "number").every((score) => score >= 0 && score <= 1));
  assert.strictEqual(result.predictiveLeadershipIntelligence.summary.totalMembers, 1);
  assert.ok(result.predictiveLeadershipIntelligence.report.rankings.length === 1);
  assert.strictEqual(result.workloadMemberPlan?.memberId, "global");
  assert.strictEqual(result.workloadPastorPlans.length, 1);
  assert.strictEqual(result.workloadLeadershipSummary.totalMembers, 1);
  assert.ok(["growing", "steady", "needs_attention"].includes(result.memberJourneySummary.direction));
  assert.ok(Array.isArray(result.memberJourneyInsights.ministryHealthSignals));
  assert.ok(result.memberJourneyRecommendations.length > 0);
  assert.ok(["urgent", "high", "normal"].includes(result.dailyPastoralBriefing.urgency.level));
  assert.strictEqual(result.dailyPastoralBriefing.scriptureEncouragement, null);
  assert.strictEqual(result.weeklyPastoralBriefing.workloadDistribution.total, 1);
  assert.ok(Array.isArray(result.eventPastoralBriefings));
}

{
  const formationEvents: FormationEvent[] = [
    {
      eventId: "member-a-started",
      occurredAt: "2026-09-01T00:00:00.000Z",
      source: "api",
      memberId: "member-a",
      pathwayId: "pathway-a",
      type: "PathwayStarted",
      payload: {
        pathwayType: "new-believer",
        startedAt: "2026-09-01T00:00:00.000Z",
        initialStepId: "welcome"
      }
    },
    {
      eventId: "member-a-stalled",
      occurredAt: "2026-09-05T00:00:00.000Z",
      source: "api",
      memberId: "member-a",
      pathwayId: "pathway-a",
      type: "StepStalledDetected",
      payload: {
        stepId: "group",
        stalledSince: "2026-09-04T00:00:00.000Z",
        reason: "No response"
      }
    },
    {
      eventId: "member-b-started",
      occurredAt: "2026-09-01T00:00:00.000Z",
      source: "api",
      memberId: "member-b",
      pathwayId: "pathway-b",
      type: "PathwayStarted",
      payload: {
        pathwayType: "membership",
        startedAt: "2026-09-01T00:00:00.000Z",
        initialStepId: "welcome"
      }
    },
    {
      eventId: "member-b-completed",
      occurredAt: "2026-09-10T00:00:00.000Z",
      source: "api",
      memberId: "member-b",
      pathwayId: "pathway-b",
      type: "PathwayCompleted",
      payload: {
        completedAt: "2026-09-10T00:00:00.000Z",
        finalStepId: "commissioned"
      }
    }
  ];
  const result = buildActivityIntelligence({
    careSummary: baseCare,
    followupStats: baseFollowups,
    formationProfiles: [],
    formationEvents,
    generatedAt: "2026-09-10T00:00:00.000Z"
  });

  assert.deepStrictEqual(
    result.formationInsights.map((insight) => insight.memberId),
    ["member-a", "member-b"]
  );
  assert.deepStrictEqual(
    result.formationRecommendations.map((recommendation) => recommendation.action),
    ["address_stalled_step", "start_next_pathway"]
  );
  assert.deepStrictEqual(
    result.formationAlerts.map((alert) => alert.signalType),
    ["StepStalledAlert", "PathwayStalledAlert", "PathwayCompletedAlert"]
  );
  assert.strictEqual(result.formationBriefing.activePathways.length, 1);
  assert.strictEqual(result.formationBriefing.stalledSteps.length, 1);
  assert.strictEqual(result.formationBriefing.completedPathways.length, 1);
  assert.deepStrictEqual(
    result.formationTimeline.map((timeline) => [timeline.memberId, timeline.items.length]),
    [["member-a", 2], ["member-b", 2]]
  );
  assert.deepStrictEqual(
    result.formationMilestones.map((item) => ({
      memberId: item.memberId,
      stalls: item.milestones.totalStalls,
      completed: item.milestones.totalPathwaysCompleted
    })),
    [
      { memberId: "member-a", stalls: 1, completed: 0 },
      { memberId: "member-b", stalls: 0, completed: 1 }
    ]
  );
  assert.deepStrictEqual(result.formationAnalytics, {
    totalPathwaysStarted: 2,
    totalPathwaysCompleted: 1,
    averagePathwayDuration: 9,
    averageStepDuration: null,
    mostCommonStalledStep: "group",
    mostCommonCompletedStep: null,
    pathwayCompletionRate: 0.5,
    stallRate: 0.5,
    activePathwayCount: 0,
    stalledPathwayCount: 1,
    completedPathwayCount: 1
  });
  assert.deepStrictEqual(
    result.formationCoaching.map((coaching) => ({
      memberId: coaching.memberId,
      priority: coaching.coachingPriority
    })),
    [
      { memberId: "member-a", priority: "high" },
      { memberId: "member-b", priority: "low" }
    ]
  );
  assert.ok(result.formationCoaching[1]?.encouragement.length);
}

console.log("activityIntelligenceService.test.ts passed");
