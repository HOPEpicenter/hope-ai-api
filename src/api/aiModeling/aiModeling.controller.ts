import type { AiAnalyticsBundle } from "../../domain/aiModeling/ai.features";
import { buildAiMemberReport, type AiMemberReport } from "../../domain/aiModeling/ai.report";

export class AiModelingController {
  constructor(private readonly analytics?: AiAnalyticsBundle) {}

  buildReport(memberId: string, analytics?: AiAnalyticsBundle): AiMemberReport | null {
    const evidence = analytics ?? this.analytics;
    return evidence ? buildAiMemberReport(memberId, evidence) : null;
  }

  getPredictions(memberId: string) { return this.buildReport(memberId)?.predictions ?? null; }
  getInsights(memberId: string) { return this.buildReport(memberId)?.insights ?? []; }
  getRecommendations(memberId: string) { return this.buildReport(memberId)?.recommendations ?? []; }
  getReport(memberId: string) { return this.buildReport(memberId); }
}