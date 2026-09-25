import type { FormationEvent } from "../../src/contracts/formationEvent.v1";
import {
  type EventBus,
  FormationEventBusAdapter,
} from "../../src/domain/formation/formation.eventBusAdapter";
import { FormationService } from "../../src/domain/formation/formation.service";

class RecordingEventBus implements EventBus {
  public readonly messages: Array<{ topic: string; event: unknown }> = [];

  public publish<TEvent>(topic: string, event: TEvent): void {
    this.messages.push({ topic, event });
  }
}

function isFormationEvent(value: unknown): value is FormationEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

describe("FormationEventBusAdapter", () => {
  it.each([
    ["startPathwayAndPublish", "PathwayStarted"],
    ["completeStepAndPublish", "StepCompleted"],
    ["detectStepStalledAndPublish", "StepStalledDetected"],
    ["completePathwayAndPublish", "PathwayCompleted"],
  ])("publishes %s on formation.events", async (method, eventType) => {
    const eventBus = new RecordingEventBus();
    const adapter = new FormationEventBusAdapter(
      new FormationService(),
      eventBus
    );

    const command = {
      memberId: "member-1",
      pathwayId: "pathway-1",
      pathwayType: "new-believer",
      initialStepId: "welcome",
    };
    const result = await (adapter[method as keyof FormationEventBusAdapter] as (
      value: typeof command
    ) => Promise<{ event: FormationEvent; state: unknown }>)(command);

    expect(result.event.type).toBe(eventType);
    expect(eventBus.messages).toHaveLength(1);
    expect(eventBus.messages[0]?.topic).toBe("formation.events");
    expect(isFormationEvent(eventBus.messages[0]?.event)).toBe(true);
    expect(eventBus.messages[0]?.event).toBe(result.event);
  });
});