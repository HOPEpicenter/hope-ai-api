import type {
  CareCaseAssigned,
  CareCaseClosed,
  CareCaseDeferred,
  CareCaseFollowUpCompleted,
  CareCaseFollowUpProgressed,
  CareCaseFollowUpStalledDetected,
  CareCaseFollowUpStarted,
  CareCaseOpened,
  CareCaseReassigned,
  CareOutcomeRecorded,
} from "../../contracts/careEvent.v1";
import {
  handleAssignCareCaseOwner,
  handleCloseCareCase,
  handleCompleteFollowUp,
  handleDeferCareCase,
  handleDetectFollowUpStalled,
  handleOpenCareCase,
  handleProgressFollowUp,
  handleReassignCareCaseOwner,
  handleRecordCareOutcome,
  handleStartFollowUp,
  type AssignCareCaseOwnerCommand,
  type CloseCareCaseCommand,
  type CompleteFollowUpCommand,
  type DeferCareCaseCommand,
  type DetectFollowUpStalledCommand,
  type OpenCareCaseCommand,
  type ProgressFollowUpCommand,
  type ReassignCareCaseOwnerCommand,
  type RecordCareOutcomeCommand,
  type StartFollowUpCommand,
} from "./careCase.commands";
import { CareCaseAggregate, type CareCaseState } from "./careCase.aggregate";

export class CareCaseService {
  public openCareCase(cmd: OpenCareCaseCommand): {
    event: CareCaseOpened;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleOpenCareCase(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public assignOwner(cmd: AssignCareCaseOwnerCommand): {
    event: CareCaseAssigned;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleAssignCareCaseOwner(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public reassignOwner(cmd: ReassignCareCaseOwnerCommand): {
    event: CareCaseReassigned;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleReassignCareCaseOwner(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public deferCase(cmd: DeferCareCaseCommand): {
    event: CareCaseDeferred;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleDeferCareCase(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public closeCase(cmd: CloseCareCaseCommand): {
    event: CareCaseClosed;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleCloseCareCase(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public recordOutcome(cmd: RecordCareOutcomeCommand): {
    event: CareOutcomeRecorded;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleRecordCareOutcome(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public startFollowUp(cmd: StartFollowUpCommand): {
    event: CareCaseFollowUpStarted;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleStartFollowUp(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public progressFollowUp(cmd: ProgressFollowUpCommand): {
    event: CareCaseFollowUpProgressed;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleProgressFollowUp(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public detectFollowUpStalled(cmd: DetectFollowUpStalledCommand): {
    event: CareCaseFollowUpStalledDetected;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleDetectFollowUpStalled(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public completeFollowUp(cmd: CompleteFollowUpCommand): {
    event: CareCaseFollowUpCompleted;
    state: CareCaseState;
  } {
    const aggregate = new CareCaseAggregate();
    const event = handleCompleteFollowUp(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }
}