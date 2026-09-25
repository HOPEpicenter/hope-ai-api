import { buildDailyPastoralBriefing } from "../../domain/pastoralBriefing/pastoralBriefing.daily";
import { buildEventPastoralBriefings } from "../../domain/pastoralBriefing/pastoralBriefing.events";
import { buildPastoralBriefingInputs, type PastoralBriefingInputSource, type PastoralBriefingInputs } from "../../domain/pastoralBriefing/pastoralBriefing.inputs";
import { buildDailyPastoralBriefingReport, buildEventPastoralBriefingReport, buildWeeklyPastoralBriefingReport } from "../../domain/pastoralBriefing/pastoralBriefing.report";
import { buildWeeklyPastoralBriefing } from "../../domain/pastoralBriefing/pastoralBriefing.weekly";

const defaultInput: PastoralBriefingInputSource = { generatedAt: "1970-01-01T00:00:00.000Z", predictiveMemberIntelligence: [], workloadMemberPlans: [], memberJourneyNarrative: { tone: "pastoral", summary: "No journey events have been recorded yet; begin with a personal, unhurried connection.", currentSeason: "There is not yet enough recorded activity to describe a current season.", direction: "steady", pastoralResponse: "Continue a steady relationship and make space for the member to name their next step." }, memberJourneySummary: "No journey events have been recorded yet; begin with a personal, unhurried connection.", ministryHealthSummary: { status: "healthy", overallScore: 100, alertCount: 0 }, ministryHealthAnalytics: { overallScore: 100, status: "healthy", scoresByDomain: {}, alertCount: 0, trendCounts: {} }, careCoaching: [], formationCoaching: [], servingCoaching: [], communityCoaching: [], givingCoaching: [], attendanceCoaching: [], engagementCoaching: [] };

export class PastoralBriefingController {
  constructor(private readonly input: PastoralBriefingInputs = buildPastoralBriefingInputs(defaultInput)) {}
  getDaily() { return buildDailyPastoralBriefing(this.input); }
  getWeekly() { return buildWeeklyPastoralBriefing(this.input); }
  getEvents() { return buildEventPastoralBriefings(this.input); }
  getDailyReport() { return buildDailyPastoralBriefingReport(this.input); }
  getWeeklyReport() { return buildWeeklyPastoralBriefingReport(this.input); }
  getEventsReport() { return buildEventPastoralBriefingReport(this.input); }
}