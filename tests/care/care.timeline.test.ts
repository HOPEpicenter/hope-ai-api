import { createCareCaseStartedEvent, createCareNoteAddedEvent } from "../../src/domain/care/care.events";
import { buildCareTimeline } from "../../src/domain/care/care.timeline";
import { createInitialCareProfile } from "../../src/domain/care/careProfile.projection";

describe("Care timeline", () => {
  it("maps ordered member events", () => {
    const started = createCareCaseStartedEvent("member-1", "case-1", null, "low");
    const note = createCareNoteAddedEvent("member-1", "case-1", "Hello");
    started.occurredAt = "2026-09-01T00:00:00.000Z";
    note.occurredAt = "2026-09-02T00:00:00.000Z";
    expect(buildCareTimeline(createInitialCareProfile("member-1"), [started, note]).map((item) => item.type)).toEqual(["CareCaseStarted", "CareNoteAdded"]);
  });
});