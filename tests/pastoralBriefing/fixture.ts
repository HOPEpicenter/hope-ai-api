import type { PastoralBriefingInputs } from "../../src/domain/pastoralBriefing/pastoralBriefing.inputs";

export const pastoralBriefingFixture: PastoralBriefingInputs = {
  generatedAt: "2026-09-25T09:00:00.000Z",
  predictiveMemberIntelligence: [{ risk: { memberId: "member-risk", stallRiskScore: 0.9, careNeedScore: 0.8, disengagementRiskScore: 0.7, growthPotentialScore: 0.1, leadershipPotentialScore: 0.1, context: [] }, priority: { memberId: "member-risk", priority: "critical", priorityScore: 0.9, rationale: "Care risk is elevated." }, insights: [], actions: [{ memberId: "member-risk", horizon: "within_24_hours", action: "pastoral_outreach", rationale: "Care risk is elevated." }] }],
  workloadMemberPlans: [{ memberId: "member-risk", pastorId: "pastor-care", priority: "urgent", primaryDriver: "care", loadImpact: 0.5, status: "assigned", action: "personal contact", timeWindow: "today", horizon: "immediate" }],
  memberJourneyNarrative: { tone: "attentive", summary: "A recent journey signal needs care.", currentSeason: "Care activity is currently most recent.", direction: "needs_attention", pastoralResponse: "Reach out personally and listen carefully." },
  memberJourneySummary: "A recent journey signal needs care.",
  ministryHealthSummary: { status: "attention", overallScore: 52, alertCount: 1 },
  ministryHealthAnalytics: { overallScore: 52, status: "attention", scoresByDomain: { care: 52 }, alertCount: 1, trendCounts: { declining: 1 } },
  careCoaching: [{ memberId: "member-risk", coachingPriority: "high", encouragement: [], concerns: ["A care case is stalled."], recommendedNextStep: "Call member-risk" }],
  formationCoaching: [], servingCoaching: [], communityCoaching: [], givingCoaching: [], attendanceCoaching: [], engagementCoaching: [],
  recentTimelineEvents: [{ memberId: "member-risk", occurredAt: "2026-09-25T08:00:00.000Z", domain: "care", type: "CareCaseStalled", summary: "Care case stalled." }]
};