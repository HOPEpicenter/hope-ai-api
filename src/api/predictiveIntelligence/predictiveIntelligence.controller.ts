import { createHealthyAiAnalyticsBundle } from "../../domain/aiModeling/ai.features";
import { buildAiMemberReport } from "../../domain/aiModeling/ai.report";
import { buildPredictiveLeadershipIntelligence, buildPredictiveMemberIntelligence } from "../../domain/predictiveIntelligence/predictive.report";

export class PredictiveIntelligenceController {
  getMember(memberId: string) {
    const aiReport = buildAiMemberReport(memberId, createHealthyAiAnalyticsBundle());
    return buildPredictiveMemberIntelligence([aiReport.predictions], createHealthyAiAnalyticsBundle().ministryHealthAnalytics)[0]!;
  }

  getLeadership() {
    const analytics = createHealthyAiAnalyticsBundle().ministryHealthAnalytics;
    return buildPredictiveLeadershipIntelligence({ members: [], ministryHealthAnalytics: analytics });
  }

  getSummary() { return this.getLeadership().summary; }
  getActions() { return this.getLeadership().actions; }
  getReport() { return this.getLeadership().report; }
}