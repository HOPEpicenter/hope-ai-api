import { handleAddCareNote, handleAssignCareOwner, handleCloseCareCase, handleDetectCareStalled, handleStartCareCase } from "../../src/domain/care/care.commands";
describe("Care commands", () => {
  it("creates all Care lifecycle events", () => {
    expect(handleStartCareCase({ memberId: "member-1", caseId: "case-1", ownerId: "owner-1", priority: "high", firstNote: "Initial" }).type).toBe("CareCaseStarted");
    expect(handleAssignCareOwner({ memberId: "member-1", caseId: "case-1", ownerId: "owner-2" }).type).toBe("CareOwnerAssigned");
    expect(handleAddCareNote({ memberId: "member-1", caseId: "case-1", note: "Check in" }).type).toBe("CareNoteAdded");
    expect(handleDetectCareStalled({ memberId: "member-1", caseId: "case-1", stalledSince: "2026-09-01T00:00:00.000Z" }).type).toBe("CareStalledDetected");
    expect(handleCloseCareCase({ memberId: "member-1", caseId: "case-1" }).type).toBe("CareCaseClosed");
  });
});