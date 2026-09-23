export const NEXT_STEP_COMPLETION_CORRECTED =
  "NEXT_STEP_COMPLETION_CORRECTED";

export type EffectiveFormationEvent = {
  type: string;
  occurredAt: string;
  rowKey: string;
  idempotencyKey?: string;
  metadata?: unknown;
};

export type EffectiveFormationEventResolution<TEvent extends EffectiveFormationEvent> = {
  auditEvents: TEvent[];
  effectiveEvents: TEvent[];
  correctedCompletionEventIds: string[];
  ignoredCorrectionEventIds: string[];
};

function eventId(event: EffectiveFormationEvent): string {
  const idempotencyKey = String(event.idempotencyKey ?? "").trim();
  if (idempotencyKey) {
    return idempotencyKey;
  }

  const separator = event.rowKey.lastIndexOf("__");
  return separator >= 0
    ? event.rowKey.slice(separator + 2)
    : event.rowKey;
}

function compareEvents(
  left: EffectiveFormationEvent,
  right: EffectiveFormationEvent
): number {
  const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
  if (occurredAt !== 0) {
    return occurredAt;
  }

  const rowKey = left.rowKey.localeCompare(right.rowKey);
  if (rowKey !== 0) {
    return rowKey;
  }

  return eventId(left).localeCompare(eventId(right));
}

function correctionTargetIds(event: EffectiveFormationEvent): string[] | null {
  const parsedMetadata =
    typeof event.metadata === "string"
      ? JSON.parse(event.metadata)
      : event.metadata;
  const targetEventIds = parsedMetadata?.data?.targetEventIds;

  if (!Array.isArray(targetEventIds) || targetEventIds.length === 0) {
    return null;
  }

  const ids = targetEventIds.map((value: unknown) => String(value ?? "").trim());

  if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
    return null;
  }

  return ids;
}

/**
 * Returns a deterministic effective stream without mutating the append-only audit stream.
 * Invalid or conflicting corrections remain visible in `auditEvents` but have no effect.
 */
export function resolveEffectiveNextStepCompletionEvents<
  TEvent extends EffectiveFormationEvent
>(events: readonly TEvent[]): EffectiveFormationEventResolution<TEvent> {
  const auditEvents = [...events].sort(compareEvents);
  const historicCompletionIds = new Set<string>();
  const correctedCompletionIds = new Set<string>();
  const ignoredCorrectionEventIds: string[] = [];

  for (const event of auditEvents) {
    if (event.type === "NEXT_STEP_COMPLETED") {
      historicCompletionIds.add(eventId(event));
      continue;
    }

    if (event.type !== NEXT_STEP_COMPLETION_CORRECTED) {
      continue;
    }

    let targets: string[] | null;
    try {
      targets = correctionTargetIds(event);
    } catch {
      targets = null;
    }

    if (
      !targets ||
      targets.some(
        targetId =>
          !historicCompletionIds.has(targetId) ||
          correctedCompletionIds.has(targetId)
      )
    ) {
      ignoredCorrectionEventIds.push(eventId(event));
      continue;
    }

    for (const targetId of targets) {
      correctedCompletionIds.add(targetId);
    }
  }

  return {
    auditEvents,
    effectiveEvents: auditEvents.filter(
      event =>
        event.type !== NEXT_STEP_COMPLETION_CORRECTED &&
        !(
          event.type === "NEXT_STEP_COMPLETED" &&
          correctedCompletionIds.has(eventId(event))
        )
    ),
    correctedCompletionEventIds: [...correctedCompletionIds].sort(),
    ignoredCorrectionEventIds: ignoredCorrectionEventIds.sort()
  };
}
