import type {
  FormationEvent,
  PathwayCompleted,
  PathwayStarted,
  StepCompleted,
  StepStalledDetected,
} from "../../contracts/formationEvent.v1";
import type {
  CompletePathwayCommand,
  CompleteStepCommand,
  DetectStepStalledCommand,
  StartPathwayCommand,
} from "./formation.commands";
import { FormationService } from "./formation.service";
import type { PathwayState } from "./pathway.aggregate";

export interface EventBus {
  publish<TEvent>(topic: string, event: TEvent): Promise<void> | void;
}

export class FormationEventBusAdapter {
  constructor(
    private readonly service: FormationService,
    private readonly eventBus: EventBus
  ) {}

  public async startPathwayAndPublish(
    cmd: StartPathwayCommand
  ): Promise<{ event: PathwayStarted; state: PathwayState }> {
    const { event, state } = this.service.startPathway(cmd);
    await this.publish("formation.events", event);
    return { event, state };
  }

  public async completeStepAndPublish(
    cmd: CompleteStepCommand
  ): Promise<{ event: StepCompleted; state: PathwayState }> {
    const { event, state } = this.service.completeStep(cmd);
    await this.publish("formation.events", event);
    return { event, state };
  }

  public async detectStepStalledAndPublish(
    cmd: DetectStepStalledCommand
  ): Promise<{ event: StepStalledDetected; state: PathwayState }> {
    const { event, state } = this.service.detectStepStalled(cmd);
    await this.publish("formation.events", event);
    return { event, state };
  }

  public async completePathwayAndPublish(
    cmd: CompletePathwayCommand
  ): Promise<{ event: PathwayCompleted; state: PathwayState }> {
    const { event, state } = this.service.completePathway(cmd);
    await this.publish("formation.events", event);
    return { event, state };
  }

  private async publish(topic: string, event: FormationEvent): Promise<void> {
    await this.eventBus.publish(topic, event);
  }
}