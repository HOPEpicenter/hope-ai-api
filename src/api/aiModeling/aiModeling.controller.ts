import { createHealthyAiAnalyticsBundle, type AiAnalyticsBundle } from "../../domain/aiModeling/ai.features";
import { buildAiMemberReport, type AiMemberReport } from "../../domain/aiModeling/ai.report";

export class AiModelingController {
  constructor(private readonly analytics: AiAnalyticsBundle = createHealthyAiAnalyticsBundle()) {}

  buildReport(memberId: string, analytics = this.analytics): AiMemberReport {
    return buildAiMemberReport(memberId, analytics);
  }

  getPredictions(memberId: string) { return this.buildReport(memberId).predictions; }
  getInsights(memberId: string) { return this.buildReport(memberId).insights; }
  getRecommendations(memberId: string) { return this.buildReport(memberId).recommendations; }
  getReport(memberId: string) { return this.buildReport(memberId); }
}