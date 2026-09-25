import { createGiftDesignationUpdatedEvent, createGiftRecordedEvent, createGivingCycleCompletedEvent, createGivingStalledDetectedEvent, type GiftDesignationUpdated, type GiftRecorded, type GivingCycleCompleted, type GivingStalledDetected } from "./giving.events";
type GivingCommandBase = { memberId: string; giftId: string; actorId?: string | null };
export type RecordGiftCommand = GivingCommandBase & { amount: number; designation: string };
export type UpdateGiftDesignationCommand = GivingCommandBase & { designation: string };
export type DetectGivingStalledCommand = GivingCommandBase & { stalledSince: string; reason?: string };
export type CompleteGivingCycleCommand = GivingCommandBase;

function validText(value: string, field: string): void { if (!value.trim()) throw new Error(`${field} is required`); }
export function handleRecordGift(command: RecordGiftCommand): GiftRecorded { if (!Number.isFinite(command.amount) || command.amount <= 0) throw new Error("amount must be a positive finite number"); validText(command.designation, "designation"); return createGiftRecordedEvent(command.memberId, command.giftId, command.amount, command.designation, command.actorId); }
export function handleUpdateGiftDesignation(command: UpdateGiftDesignationCommand): GiftDesignationUpdated { validText(command.designation, "designation"); return createGiftDesignationUpdatedEvent(command.memberId, command.giftId, command.designation, command.actorId); }
export const handleDetectGivingStalled = (command: DetectGivingStalledCommand): GivingStalledDetected => createGivingStalledDetectedEvent(command.memberId, command.giftId, command.stalledSince, command.reason, command.actorId);
export const handleCompleteGivingCycle = (command: CompleteGivingCycleCommand): GivingCycleCompleted => createGivingCycleCompletedEvent(command.memberId, command.giftId, command.actorId);