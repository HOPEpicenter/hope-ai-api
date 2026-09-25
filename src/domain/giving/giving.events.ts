export type GivingEventBase = { eventId: string; occurredAt: string; memberId: string; giftId: string; actorId?: string | null };
export type GiftRecorded = GivingEventBase & { type: "GiftRecorded"; payload: { amount: number; designation: string } };
export type GiftDesignationUpdated = GivingEventBase & { type: "GiftDesignationUpdated"; payload: { designation: string } };
export type GivingStalledDetected = GivingEventBase & { type: "GivingStalledDetected"; payload: { stalledSince: string; reason?: string } };
export type GivingCycleCompleted = GivingEventBase & { type: "GivingCycleCompleted"; payload: { completedAt: string } };
export type GivingEvent = GiftRecorded | GiftDesignationUpdated | GivingStalledDetected | GivingCycleCompleted;

function base(memberId: string, giftId: string, actorId?: string | null): GivingEventBase {
  return { eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), memberId, giftId, actorId: actorId ?? null };
}

export function createGiftRecordedEvent(memberId: string, giftId: string, amount: number, designation: string, actorId?: string | null): GiftRecorded {
  return { ...base(memberId, giftId, actorId), type: "GiftRecorded", payload: { amount, designation } };
}
export function createGiftDesignationUpdatedEvent(memberId: string, giftId: string, designation: string, actorId?: string | null): GiftDesignationUpdated {
  return { ...base(memberId, giftId, actorId), type: "GiftDesignationUpdated", payload: { designation } };
}
export function createGivingStalledDetectedEvent(memberId: string, giftId: string, stalledSince: string, reason?: string, actorId?: string | null): GivingStalledDetected {
  return { ...base(memberId, giftId, actorId), type: "GivingStalledDetected", payload: { stalledSince, reason } };
}
export function createGivingCycleCompletedEvent(memberId: string, giftId: string, actorId?: string | null): GivingCycleCompleted {
  const event = base(memberId, giftId, actorId);
  return { ...event, type: "GivingCycleCompleted", payload: { completedAt: event.occurredAt } };
}