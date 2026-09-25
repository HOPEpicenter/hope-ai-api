import { CareAggregate } from "../../src/domain/care/care.aggregate";
import { handleAddCareNote, handleStartCareCase } from "../../src/domain/care/care.commands";

describe("Care aggregate", () => {
  it("replays a case lifecycle", () => {
    const aggregate = new CareAggregate();
    aggregate.apply(handleStartCareCase({ memberId: "member-1", caseId: "case-1", ownerId: null, priority: "high" }));
    aggregate.apply(handleAddCareNote({ memberId: "member-1", caseId: "case-1", note: "Called" }));
    expect(aggregate.getState()).toMatchObject({ memberId: "member-1", status: "open", priority: "high" });
    expect(aggregate.getState().notes).toHaveLength(1);
  });
});