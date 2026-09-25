import { applyGivingEvent, type GiftState } from "./giving.aggregate";
import type { GivingEvent } from "./giving.events";
export type GivingProfile = { memberId: string; gifts: GiftState[]; totalGiven: number; giftCount: number; activeGift: GiftState | null; stalledSince: string | null; status: "active" | "stalled" | "completed" | "none"; lastUpdatedAt: string | null };
export function createInitialGivingProfile(memberId: string): GivingProfile { return { memberId, gifts: [], totalGiven: 0, giftCount: 0, activeGift: null, stalledSince: null, status: "none", lastUpdatedAt: null }; }
export function applyGivingEventToProfile(profile: GivingProfile, event: GivingEvent): GivingProfile {
  const existing = profile.gifts.find((gift) => gift.giftId === event.giftId);
  const nextGift = applyGivingEvent(existing ?? { giftId: event.giftId, memberId: event.memberId, amount: 0, designation: null, recordedAt: null, stalledSince: null, completedAt: null, status: "active" }, event);
  const gifts = existing ? profile.gifts.map((gift) => gift.giftId === event.giftId ? nextGift : gift) : [...profile.gifts, nextGift];
  const activeGift = [...gifts].filter((gift) => gift.status !== "completed").sort((left, right) => (right.recordedAt ?? "").localeCompare(left.recordedAt ?? ""))[0] ?? null;
  return { memberId: event.memberId, gifts, totalGiven: gifts.reduce((total, gift) => total + gift.amount, 0), giftCount: gifts.filter((gift) => gift.recordedAt !== null).length, activeGift, stalledSince: activeGift?.stalledSince ?? null, status: activeGift?.status ?? (gifts.length ? "completed" : "none"), lastUpdatedAt: event.occurredAt };
}