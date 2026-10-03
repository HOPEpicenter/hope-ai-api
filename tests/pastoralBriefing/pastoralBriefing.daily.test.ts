import { buildDailyPastoralBriefing } from "../../src/domain/pastoralBriefing/pastoralBriefing.daily";
import { pastoralBriefingFixture } from "./fixture";

describe("daily pastoral briefing", () => {
  it("combines predictive and workload urgency with no more than two actions", () => {
    const briefing = buildDailyPastoralBriefing(pastoralBriefingFixture);
    expect(briefing.urgency).toMatchObject({ level: "urgent", memberIds: ["member-risk"] });
    expect(briefing.trendSnapshot.direction).toBe("declining");
    expect(briefing.actions).toHaveLength(1);
    expect(briefing.scriptureEncouragement).toBeNull();
  });

  it("reports insufficient priority evidence without inventing actions", () => {
    const briefing = buildDailyPastoralBriefing({
      ...pastoralBriefingFixture,
      predictiveMemberIntelligence: [],
      workloadMemberPlans: [],
      memberJourneyNarrative: {
        ...pastoralBriefingFixture.memberJourneyNarrative,
        direction: "insufficient_data"
      },
      ministryHealthSummary: { status: "insufficient_data", overallScore: null, alertCount: 0 }
    });

    expect(briefing.trendSnapshot.direction).toBe("insufficient_data");
    expect(briefing.trendSnapshot.summary).toContain("Evidence is insufficient");
    expect(briefing.urgency).toMatchObject({
      level: "normal",
      summary: "Pastoral priority evidence is currently insufficient.",
      memberIds: []
    });
    expect(briefing.actions).toEqual([]);
  });

  it("preserves real urgent evidence when Ministry Health is insufficient", () => {
    const briefing = buildDailyPastoralBriefing({
      ...pastoralBriefingFixture,
      ministryHealthSummary: { status: "insufficient_data", overallScore: null, alertCount: 0 }
    });

    expect(briefing.urgency.level).toBe("urgent");
    expect(briefing.urgency.memberIds).toEqual(["member-risk"]);
    expect(briefing.urgency.summary).toContain("prioritized pastoral attention");
    expect(briefing.actions).toHaveLength(1);
  });

  it("preserves high predictive priority when Ministry Health is insufficient", () => {
    const briefing = buildDailyPastoralBriefing({
      ...pastoralBriefingFixture,
      predictiveMemberIntelligence: [{
        ...pastoralBriefingFixture.predictiveMemberIntelligence[0]!,
        priority: {
          ...pastoralBriefingFixture.predictiveMemberIntelligence[0]!.priority,
          priority: "high"
        }
      }],
      workloadMemberPlans: [],
      ministryHealthSummary: { status: "insufficient_data", overallScore: null, alertCount: 0 }
    });

    expect(briefing.urgency).toMatchObject({
      level: "high",
      summary: "1 member(s) need prioritized pastoral attention.",
      memberIds: ["member-risk"]
    });
    expect(briefing.actions).toEqual([]);
  });

  it("preserves improving trends when evidence supports them", () => {
    const briefing = buildDailyPastoralBriefing({
      ...pastoralBriefingFixture,
      memberJourneyNarrative: {
        ...pastoralBriefingFixture.memberJourneyNarrative,
        direction: "growing"
      },
      ministryHealthSummary: { status: "healthy", overallScore: 90, alertCount: 0 }
    });

    expect(briefing.trendSnapshot.direction).toBe("improving");
  });

  it("retains the no-priorities conclusion when evidence is sufficient", () => {
    const briefing = buildDailyPastoralBriefing({
      ...pastoralBriefingFixture,
      predictiveMemberIntelligence: [],
      workloadMemberPlans: [],
      memberJourneyNarrative: {
        ...pastoralBriefingFixture.memberJourneyNarrative,
        direction: "steady"
      },
      ministryHealthSummary: { status: "healthy", overallScore: 90, alertCount: 0 }
    });

    expect(briefing.urgency.summary).toBe("No urgent pastoral priorities are currently identified.");
  });
});