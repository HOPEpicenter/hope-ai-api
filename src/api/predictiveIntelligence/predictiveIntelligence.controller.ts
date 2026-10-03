import type { MinistryHealthAnalytics } from "../../domain/ministryHealth/ministryHealth.analytics";
import {
  buildPredictiveLeadershipIntelligence,
  type PredictiveMemberIntelligence
} from "../../domain/predictiveIntelligence/predictive.report";

export type PredictiveIntelligenceControllerInput = {
  members: readonly PredictiveMemberIntelligence[];
  ministryHealthAnalytics: MinistryHealthAnalytics;
};

const unavailableAnalytics: MinistryHealthAnalytics = {
  overallScore: null,
  status: "insufficient_data",
  scoresByDomain: {},
  alertCount: 0,
  trendCounts: { insufficient_data: 7 }
};

export class PredictiveIntelligenceController {
  constructor(
    private readonly input: PredictiveIntelligenceControllerInput = {
      members: [],
      ministryHealthAnalytics: unavailableAnalytics
    }
  ) {}

  getMember(memberId: string) {
    return this.input.members.find((member) => member.risk.memberId === memberId) ?? null;
  }

  getLeadership() {
    return buildPredictiveLeadershipIntelligence({
      members: this.input.members,
      ministryHealthAnalytics: this.input.ministryHealthAnalytics
    });
  }

  getSummary() { return this.getLeadership().summary; }
  getActions() { return this.getLeadership().actions; }
  getReport() { return this.getLeadership().report; }
}