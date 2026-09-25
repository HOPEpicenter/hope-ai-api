import type { AttendanceAnalytics } from "../attendance/attendance.analytics";
import type { CareAnalytics } from "../care/care.analytics";
import type { CommunityAnalytics } from "../community/community.analytics";
import type { EngagementAnalytics } from "../engagement/engagement.analytics";
import type { FormationAnalytics } from "../formation/formation.analytics";
import type { GivingAnalytics } from "../giving/giving.analytics";
import type { MinistryHealthAnalytics } from "../ministryHealth/ministryHealth.analytics";
import type { ServingAnalytics } from "../serving/serving.analytics";

export type AiAnalyticsBundle = {
  formationAnalytics: FormationAnalytics;
  careAnalytics: CareAnalytics;
  servingAnalytics: ServingAnalytics;
  communityAnalytics: CommunityAnalytics;
  givingAnalytics: GivingAnalytics;
  attendanceAnalytics: AttendanceAnalytics;
  engagementAnalytics: EngagementAnalytics;
  ministryHealthAnalytics: MinistryHealthAnalytics;
};

export type AiDomainScores = {
  formation: number;
  care: number;
  serving: number;
  community: number;
  giving: number;
  attendance: number;
  engagement: number;
  ministryHealth: number;
  overall: number;
};

export type AiFeatureVector = {
  memberId: string;
  scores: AiDomainScores;
  stallRiskIndicators: string[];
  growthIndicators: string[];
  trendVelocity: number;
  alertDensity: number;
  riskClusters: string[];
  strengthClusters: string[];
};

const DOMAIN_COUNT = 8;

function bounded(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}

function ratio(numerator: unknown, denominator: unknown): number {
  const total = typeof denominator === "number" && denominator > 0 ? denominator : 0;
  const value = typeof numerator === "number" && numerator > 0 ? numerator : 0;
  return total ? bounded(value / total) : 0;
}

function healthScore(value: unknown): number {
  const score = typeof value === "number" ? value : 0;
  return bounded(score > 1 ? score / 100 : score);
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

export function createHealthyAiAnalyticsBundle(): AiAnalyticsBundle {
  return {
    formationAnalytics: { totalPathwaysStarted: 0, totalPathwaysCompleted: 0, averagePathwayDuration: null, averageStepDuration: null, mostCommonStalledStep: null, mostCommonCompletedStep: null, pathwayCompletionRate: 0, stallRate: 0, activePathwayCount: 0, stalledPathwayCount: 0, completedPathwayCount: 0 },
    careAnalytics: { totalMembers: 0, totalCases: 0, openCases: 0, stalledCases: 0, closedCases: 0, highPriorityOpenCases: 0, unassignedOpenCases: 0, closureRate: 0 },
    servingAnalytics: { totalMembers: 0, totalAssignments: 0, activeAssignments: 0, stalledAssignments: 0, closedAssignments: 0, highPriorityActiveAssignments: 0, unassignedRoleAssignments: 0, totalActivities: 0, closureRate: 0 },
    communityAnalytics: { totalMembers: 0, totalEngagements: 0, activeEngagements: 0, stalledEngagements: 0, completedEngagements: 0, highPriorityActiveEngagements: 0, unassignedGroupEngagements: 0, totalInteractions: 0, completionRate: 0 },
    givingAnalytics: { totalMembers: 0, totalGifts: 0, totalGiven: 0, averageGiftAmount: 0, activeGifts: 0, stalledGifts: 0, completedGifts: 0, increasingGenerosityMembers: 0, decreasingGenerosityMembers: 0, completionRate: 0 },
    attendanceAnalytics: { totalMembers: 0, totalRecords: 0, presentCount: 0, absentCount: 0, lateCount: 0, attendedCount: 0, attendanceRate: 0, stalledRecords: 0, completedCycles: 0 },
    engagementAnalytics: { totalMembers: 0, totalCycles: 0, totalTouchpoints: 0, totalEngagementScore: 0, averageEngagementScore: 0, stalledCycles: 0, completedCycles: 0, completionRate: 0 },
    ministryHealthAnalytics: { overallScore: 100, status: "healthy", scoresByDomain: {}, alertCount: 0, trendCounts: {} }
  };
}

export function buildAiFeatureVector(
  memberId: string,
  analytics: AiAnalyticsBundle
): AiFeatureVector {
  const formation = bounded(analytics.formationAnalytics.pathwayCompletionRate * (1 - bounded(analytics.formationAnalytics.stallRate)));
  const care = bounded(analytics.careAnalytics.closureRate * (1 - ratio(analytics.careAnalytics.highPriorityOpenCases + analytics.careAnalytics.unassignedOpenCases, analytics.careAnalytics.totalCases)));
  const serving = bounded(analytics.servingAnalytics.closureRate * (1 - ratio(analytics.servingAnalytics.stalledAssignments + analytics.servingAnalytics.unassignedRoleAssignments, analytics.servingAnalytics.totalAssignments)));
  const community = bounded(analytics.communityAnalytics.completionRate * (1 - ratio(analytics.communityAnalytics.stalledEngagements + analytics.communityAnalytics.unassignedGroupEngagements, analytics.communityAnalytics.totalEngagements)));
  const giving = bounded(analytics.givingAnalytics.completionRate + ratio(analytics.givingAnalytics.increasingGenerosityMembers, analytics.givingAnalytics.totalMembers) * 0.25 - ratio(analytics.givingAnalytics.decreasingGenerosityMembers, analytics.givingAnalytics.totalMembers) * 0.25);
  const attendance = bounded(analytics.attendanceAnalytics.attendanceRate * (1 - ratio(analytics.attendanceAnalytics.stalledRecords, analytics.attendanceAnalytics.totalRecords)));
  const engagement = bounded(analytics.engagementAnalytics.completionRate * 0.6 + bounded(analytics.engagementAnalytics.averageEngagementScore / 100) * 0.4 - ratio(analytics.engagementAnalytics.stalledCycles, analytics.engagementAnalytics.totalCycles) * 0.25);
  const ministryHealth = healthScore(analytics.ministryHealthAnalytics.overallScore);
  const scores: AiDomainScores = { formation, care, serving, community, giving, attendance, engagement, ministryHealth, overall: 0 };
  scores.overall = bounded((formation + care + serving + community + giving + attendance + engagement + ministryHealth) / DOMAIN_COUNT);

  const stallRiskIndicators: string[] = [];
  const growthIndicators: string[] = [];
  if (analytics.formationAnalytics.stallRate > 0) stallRiskIndicators.push("Formation pathways include stalled progress.");
  if (analytics.careAnalytics.stalledCases > 0 || analytics.careAnalytics.unassignedOpenCases > 0) stallRiskIndicators.push("Care has stalled or unassigned open cases.");
  if (analytics.servingAnalytics.stalledAssignments > 0 || analytics.servingAnalytics.unassignedRoleAssignments > 0) stallRiskIndicators.push("Serving has stalled or unassigned assignments.");
  if (analytics.communityAnalytics.stalledEngagements > 0 || analytics.communityAnalytics.unassignedGroupEngagements > 0) stallRiskIndicators.push("Community has stalled or unassigned engagement.");
  if (analytics.attendanceAnalytics.stalledRecords > 0) stallRiskIndicators.push("Attendance includes stalled records.");
  if (analytics.engagementAnalytics.stalledCycles > 0) stallRiskIndicators.push("Engagement includes stalled cycles.");
  if (analytics.ministryHealthAnalytics.alertCount > 0) stallRiskIndicators.push("Ministry health has active alerts.");
  if (scores.formation >= 0.6) growthIndicators.push("Formation completion is sustaining progress.");
  if (scores.attendance >= 0.6) growthIndicators.push("Attendance is sustaining connection.");
  if (scores.engagement >= 0.6) growthIndicators.push("Engagement activity is sustaining connection.");
  if (analytics.givingAnalytics.increasingGenerosityMembers > analytics.givingAnalytics.decreasingGenerosityMembers) growthIndicators.push("Generosity is trending upward.");
  if (scores.community >= 0.6) growthIndicators.push("Community participation is completing well.");

  const improving = (analytics.ministryHealthAnalytics.trendCounts.improving ?? 0) + analytics.givingAnalytics.increasingGenerosityMembers;
  const declining = (analytics.ministryHealthAnalytics.trendCounts.declining ?? 0) + analytics.givingAnalytics.decreasingGenerosityMembers + analytics.formationAnalytics.stalledPathwayCount;
  const trendVelocity = bounded((improving - declining + DOMAIN_COUNT) / (DOMAIN_COUNT * 2));
  const alertDensity = bounded((analytics.ministryHealthAnalytics.alertCount + stallRiskIndicators.length) / DOMAIN_COUNT);
  const lowDomainCount = Object.values(scores).slice(0, DOMAIN_COUNT).filter((score) => score < 0.4).length;
  const highDomainCount = Object.values(scores).slice(0, DOMAIN_COUNT).filter((score) => score >= 0.6).length;
  const riskClusters = unique([
    ...(lowDomainCount >= 2 ? ["Cross-domain momentum risk: multiple domains are below 0.40."] : []),
    ...(stallRiskIndicators.length >= 2 ? ["Cross-domain stall risk: multiple workflows need intervention."] : []),
    ...(alertDensity >= 0.4 ? ["Cross-domain alert concentration is elevated."] : [])
  ]);
  const strengthClusters = unique([
    ...(highDomainCount >= 3 ? ["Cross-domain strength: multiple domains are sustaining progress."] : []),
    ...(trendVelocity >= 0.6 ? ["Cross-domain trend velocity is positive."] : [])
  ]);

  return { memberId, scores, stallRiskIndicators, growthIndicators, trendVelocity, alertDensity, riskClusters, strengthClusters };
}