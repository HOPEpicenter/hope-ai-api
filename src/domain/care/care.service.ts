import { CareAggregate, type CareCaseState } from "./care.aggregate";
import { handleAddCareNote, handleAssignCareOwner, handleCloseCareCase, handleDetectCareStalled, handleStartCareCase, type AddCareNoteCommand, type AssignCareOwnerCommand, type CloseCareCaseCommand, type DetectCareStalledCommand, type StartCareCaseCommand } from "./care.commands";
import type { CareCaseClosed, CareCaseStarted, CareNoteAdded, CareOwnerAssigned, CareStalledDetected } from "./care.events";
export class CareService {
  public startCareCase(cmd: StartCareCaseCommand): { event: CareCaseStarted; state: CareCaseState } { const event = handleStartCareCase(cmd); const aggregate = new CareAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
  public assignOwner(cmd: AssignCareOwnerCommand): { event: CareOwnerAssigned; state: CareCaseState } { const event = handleAssignCareOwner(cmd); const aggregate = new CareAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
  public addNote(cmd: AddCareNoteCommand): { event: CareNoteAdded; state: CareCaseState } { const event = handleAddCareNote(cmd); const aggregate = new CareAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
  public detectStalled(cmd: DetectCareStalledCommand): { event: CareStalledDetected; state: CareCaseState } { const event = handleDetectCareStalled(cmd); const aggregate = new CareAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
  public closeCareCase(cmd: CloseCareCaseCommand): { event: CareCaseClosed; state: CareCaseState } { const event = handleCloseCareCase(cmd); const aggregate = new CareAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
}