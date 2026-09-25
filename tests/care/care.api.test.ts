import { CareController } from "../../src/api/care/care.controller";
import { CareProfileIndex } from "../../src/domain/care/careProfile.index";

describe("Care controller", () => {
  it("returns shaped empty models for an unknown member", () => {
    const controller = new CareController(new CareProfileIndex());
    expect(controller.getProfile("unknown")).toMatchObject({ memberId: "unknown", cases: [] });
    expect(controller.getTimeline("unknown")).toEqual([]);
    expect(controller.getMilestones("unknown")).toMatchObject({ totalCasesStarted: 0 });
    expect(controller.getReport("unknown")).toMatchObject({ memberId: "unknown", cases: { started: 0 } });
  });
});