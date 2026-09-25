import { createCareCaseStartedEvent, createCareStalledDetectedEvent } from "../../src/domain/care/care.events";
import { CareProfileIndex } from "../../src/domain/care/careProfile.index";

describe("Care profile index", () => {
  it("replays cases into a member profile", () => {
    const index = new CareProfileIndex();
    const started = createCareCaseStartedEvent("member-1", "case-1", null, "high");
    const stalled = createCareStalledDetectedEvent("member-1", "case-1", "2026-09-01T00:00:00.000Z");
    started.occurredAt = "2026-09-01T00:00:00.000Z";
    stalled.occurredAt = "2026-09-02T00:00:00.000Z";
    index.replayEvents([started, stalled]);
    expect(index.getProfile("member-1")).toMatchObject({ memberId: "member-1", stalledCaseIds: ["case-1"] });
  });
});