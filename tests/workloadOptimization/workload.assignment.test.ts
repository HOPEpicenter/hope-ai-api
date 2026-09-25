import { assignPastoralWorkload } from "../../src/domain/workloadOptimization/workload.assignment";

const rankings = [
  { memberId: "urgent-a", priority: "urgent" as const, priorityScore: 0.9, primaryDriver: "care" as const, driverWords: ["care"], rationale: "" },
  { memberId: "urgent-b", priority: "urgent" as const, priorityScore: 0.85, primaryDriver: "care" as const, driverWords: ["care"], rationale: "" }
];

describe("assignPastoralWorkload", () => {
  it("matches strengths, balances urgent work, and reports the post-assignment load impact", () => {
    const assignments = assignPastoralWorkload(rankings, [
      { pastorId: "care-a", strengths: ["care"], capacity: 2, currentLoad: 0 },
      { pastorId: "care-b", strengths: ["care"], capacity: 2, currentLoad: 0 }
    ]);

    expect(assignments.map((item) => item.pastorId)).toEqual(["care-a", "care-b"]);
    expect(assignments[0]!.loadImpact).toBe(0.5);
  });

  it("never uses an initially over-capacity pastor while capacity remains", () => {
    const assignments = assignPastoralWorkload([rankings[0]!], [
      { pastorId: "full", strengths: ["care"], capacity: 1, currentLoad: 1 },
      { pastorId: "available", strengths: ["care"], capacity: 2, currentLoad: 1 }
    ]);

    expect(assignments[0]).toMatchObject({ pastorId: "available", status: "assigned", loadImpact: 1 });
  });

  it("leaves work unassigned only once every profile is exhausted", () => {
    const assignments = assignPastoralWorkload([rankings[0]!], [
      { pastorId: "full", strengths: ["care"], capacity: 1, currentLoad: 1 }
    ]);

    expect(assignments[0]).toMatchObject({ pastorId: null, status: "unassigned", loadImpact: null });
  });
});