import { buildPastoralWorkloadReport } from "../../src/domain/workloadOptimization/workload.report";

describe("buildPastoralWorkloadReport", () => {
  it("summarizes ownership, unassigned workload, urgent cases, and pastor loads", () => {
    const assignments = [
      { memberId: "member-a", pastorId: "pastor-a", priority: "urgent" as const, primaryDriver: "care", loadImpact: 0.5, status: "assigned" as const },
      { memberId: "member-b", pastorId: null, priority: "high" as const, primaryDriver: "stall", loadImpact: null, status: "unassigned" as const }
    ];
    const report = buildPastoralWorkloadReport([], assignments, []);

    expect(report.summary).toEqual({ totalMembers: 2, assignedCount: 1, unassignedCount: 1, urgentCount: 1, byPastor: { "pastor-a": 1 } });
  });
});