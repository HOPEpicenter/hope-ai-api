import { buildCareMilestones } from "../../src/domain/care/care.milestones";

describe("Care milestones", () => {
  it("counts lifecycle milestones", () => {
    const milestones = buildCareMilestones([{ occurredAt: "2026-09-01T00:00:00.000Z", type: "CareCaseStarted", caseId: "case-1" }, { occurredAt: "2026-09-02T00:00:00.000Z", type: "CareCaseClosed", caseId: "case-1" }]);
    expect(milestones).toMatchObject({ totalCasesStarted: 1, totalCasesClosed: 1, totalStalls: 0 });
  });
});