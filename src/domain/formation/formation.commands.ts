import {
  createPathwayCompletedEvent,
  createPathwayStartedEvent,
  createStepCompletedEvent,
  createStepStalledDetectedEvent,
  type PathwayCompleted,
  type PathwayStarted,
  type StepCompleted,
  type StepStalledDetected,
} from "../../contracts/formationEvent.v1";

export type StartPathwayCommand = {
  memberId: string;
  pathwayId: string;
  pathwayType: string;
  initialStepId: string;
  actorId?: string | null;
};

export type CompleteStepCommand = {
  memberId: string;
  pathwayId: string;
  stepId: string;
  notes?: string;
  actorId?: string | null;
};

export type DetectStepStalledCommand = {
  memberId: string;
  pathwayId: string;
  stepId: string;
  stalledSince: string;
  reason?: string;
  actorId?: string | null;
};

export type CompletePathwayCommand = {
  memberId: string;
  pathwayId: string;
  finalStepId: string;
  actorId?: string | null;
};

export function handleStartPathway(
  cmd: StartPathwayCommand
): PathwayStarted {
  return createPathwayStartedEvent(
    cmd.memberId,
    cmd.pathwayId,
    cmd.pathwayType,
    cmd.initialStepId,
    cmd.actorId
  );
}

export function handleCompleteStep(cmd: CompleteStepCommand): StepCompleted {
  return createStepCompletedEvent(
    cmd.memberId,
    cmd.pathwayId,
    cmd.stepId,
    cmd.notes,
    cmd.actorId
  );
}

export function handleDetectStepStalled(
  cmd: DetectStepStalledCommand
): StepStalledDetected {
  return createStepStalledDetectedEvent(
    cmd.memberId,
    cmd.pathwayId,
    cmd.stepId,
    cmd.stalledSince,
    cmd.reason,
    cmd.actorId
  );
}

export function handleCompletePathway(
  cmd: CompletePathwayCommand
): PathwayCompleted {
  return createPathwayCompletedEvent(
    cmd.memberId,
    cmd.pathwayId,
    cmd.finalStepId,
    cmd.actorId
  );
}