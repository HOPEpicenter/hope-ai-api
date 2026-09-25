import type {
  PathwayCompleted,
  PathwayStarted,
  StepCompleted,
  StepStalledDetected,
} from "../../contracts/formationEvent.v1";
import {
  handleCompletePathway,
  handleCompleteStep,
  handleDetectStepStalled,
  handleStartPathway,
  type CompletePathwayCommand,
  type CompleteStepCommand,
  type DetectStepStalledCommand,
  type StartPathwayCommand,
} from "./formation.commands";
import { PathwayAggregate, type PathwayState } from "./pathway.aggregate";

export class FormationService {
  public startPathway(cmd: StartPathwayCommand): {
    event: PathwayStarted;
    state: PathwayState;
  } {
    const aggregate = new PathwayAggregate();
    const event = handleStartPathway(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public completeStep(cmd: CompleteStepCommand): {
    event: StepCompleted;
    state: PathwayState;
  } {
    const aggregate = new PathwayAggregate();
    const event = handleCompleteStep(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public detectStepStalled(cmd: DetectStepStalledCommand): {
    event: StepStalledDetected;
    state: PathwayState;
  } {
    const aggregate = new PathwayAggregate();
    const event = handleDetectStepStalled(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public completePathway(cmd: CompletePathwayCommand): {
    event: PathwayCompleted;
    state: PathwayState;
  } {
    const aggregate = new PathwayAggregate();
    const event = handleCompletePathway(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }
}