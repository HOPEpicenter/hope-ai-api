import {
  createCareCaseClosedEvent,
  createCareCaseStartedEvent,
  createCareNoteAddedEvent,
  createCareOwnerAssignedEvent,
  createCareStalledDetectedEvent,
  type CareCaseClosed,
  type CareCaseStarted,
  type CareNoteAdded,
  type CareOwnerAssigned,
  type CarePriority,
  type CareStalledDetected
} from "./care.events";

type CareCommandBase = { memberId: string; caseId: string; actorId?: string | null };
export type StartCareCaseCommand = CareCommandBase & { ownerId: string | null; priority: CarePriority; firstNote?: string };
export type AssignCareOwnerCommand = CareCommandBase & { ownerId: string };
export type AddCareNoteCommand = CareCommandBase & { note: string };
export type DetectCareStalledCommand = CareCommandBase & { stalledSince: string; reason?: string };
export type CloseCareCaseCommand = CareCommandBase;
export const handleStartCareCase = (cmd: StartCareCaseCommand): CareCaseStarted => createCareCaseStartedEvent(cmd.memberId, cmd.caseId, cmd.ownerId, cmd.priority, cmd.firstNote, cmd.actorId);
export const handleAssignCareOwner = (cmd: AssignCareOwnerCommand): CareOwnerAssigned => createCareOwnerAssignedEvent(cmd.memberId, cmd.caseId, cmd.ownerId, cmd.actorId);
export const handleAddCareNote = (cmd: AddCareNoteCommand): CareNoteAdded => createCareNoteAddedEvent(cmd.memberId, cmd.caseId, cmd.note, cmd.actorId);
export const handleDetectCareStalled = (cmd: DetectCareStalledCommand): CareStalledDetected => createCareStalledDetectedEvent(cmd.memberId, cmd.caseId, cmd.stalledSince, cmd.reason, cmd.actorId);
export const handleCloseCareCase = (cmd: CloseCareCaseCommand): CareCaseClosed => createCareCaseClosedEvent(cmd.memberId, cmd.caseId, cmd.actorId);