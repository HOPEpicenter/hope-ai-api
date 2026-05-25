import { compareEventOrder } from "../../../functions/_shared/reconciliation";

export type StageTransitionProfile = {
  stage?: string | null;
  stageUpdatedAt?: string | null;
  stageUpdatedBy?: string | null;
  stageReason?: string | null;
};

export function applyStageTransition(params: {
  profile: StageTransitionProfile & Record<string, any>;
  stage: string;
  occurredAtIso: string;
  eventType: string;
  eventId: string;
}): void {
  const {
    profile,
    stage,
    occurredAtIso,
    eventType,
    eventId
  } = params;

  const currentStageEventId =
    String(profile.stageEventId ?? "").trim();

  const shouldApplyStage =
    profile.stage !== stage &&
    compareEventOrder(
      occurredAtIso,
      eventId,
      profile.stageUpdatedAt,
      currentStageEventId
    ) > 0;

  if (!shouldApplyStage) {
    return;
  }

  profile.stage = stage;
  profile.stageUpdatedAt = occurredAtIso;
  profile.stageUpdatedBy = "system";
  profile.stageReason = "event:" + eventType;
  profile.stageEventId = eventId;
}
