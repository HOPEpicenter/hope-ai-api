import { CareService } from "../../src/domain/care/care.service";

describe("Care service", () => {
  it("returns an event and state for a new case", () => {
    const result = new CareService().startCareCase({ memberId: "member-1", caseId: "case-1", ownerId: "owner-1", priority: "medium" });
    expect(result.event.type).toBe("CareCaseStarted");
    expect(result.state.ownerId).toBe("owner-1");
  });
});