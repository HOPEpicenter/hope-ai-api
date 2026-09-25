import { buildDailyPastoralBriefingReport, buildEventPastoralBriefingReport, buildWeeklyPastoralBriefingReport } from "../../src/domain/pastoralBriefing/pastoralBriefing.report";
import { pastoralBriefingFixture } from "./fixture";

describe("pastoral briefing reports", () => {
  it("includes report identity, overview, briefing, and source summary for every report", () => {
    for (const report of [buildDailyPastoralBriefingReport(pastoralBriefingFixture), buildWeeklyPastoralBriefingReport(pastoralBriefingFixture), buildEventPastoralBriefingReport(pastoralBriefingFixture)]) {
      expect(report.overview).not.toBe("");
      expect(report.sourceSummary).toMatchObject({ predictiveMembers: 1, workloadPlans: 1, timelineEvents: 1 });
    }
  });
});