import { GivingAggregate, type GiftState } from "./giving.aggregate";
import { handleCompleteGivingCycle, handleDetectGivingStalled, handleRecordGift, handleUpdateGiftDesignation, type CompleteGivingCycleCommand, type DetectGivingStalledCommand, type RecordGiftCommand, type UpdateGiftDesignationCommand } from "./giving.commands";
import type { GiftDesignationUpdated, GiftRecorded, GivingCycleCompleted, GivingStalledDetected } from "./giving.events";
export class GivingService {
  public recordGift(command: RecordGiftCommand): { event: GiftRecorded; state: GiftState } { const event = handleRecordGift(command); const aggregate = new GivingAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
  public updateGiftDesignation(command: UpdateGiftDesignationCommand): { event: GiftDesignationUpdated; state: GiftState } { const event = handleUpdateGiftDesignation(command); const aggregate = new GivingAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
  public detectStalled(command: DetectGivingStalledCommand): { event: GivingStalledDetected; state: GiftState } { const event = handleDetectGivingStalled(command); const aggregate = new GivingAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
  public completeGivingCycle(command: CompleteGivingCycleCommand): { event: GivingCycleCompleted; state: GiftState } { const event = handleCompleteGivingCycle(command); const aggregate = new GivingAggregate(); aggregate.apply(event); return { event, state: aggregate.getState() }; }
}