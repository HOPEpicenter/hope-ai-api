import type {
  AlertEvent,
  IntelligenceAlertAcknowledged,
  IntelligenceAlertRaised,
  IntelligenceAlertResolved,
} from "../../contracts/alertEvent.v1";
import type {
  AcknowledgeAlertCommand,
  RaiseAlertCommand,
  ResolveAlertCommand,
} from "./alert.commands";
import type { AlertState } from "./alert.aggregate";
import { AlertService } from "./alert.service";

export interface EventBus {
  publish<TEvent>(topic: string, event: TEvent): Promise<void> | void;
}

export class AlertEventBusAdapter {
  constructor(
    private readonly service: AlertService,
    private readonly eventBus: EventBus
  ) {}

  public async raiseAlertAndPublish(
    cmd: RaiseAlertCommand
  ): Promise<{ event: IntelligenceAlertRaised; state: AlertState }> {
    const { event, state } = this.service.raiseAlert(cmd);
    await this.publish("intelligence.alerts", event);
    return { event, state };
  }

  public async acknowledgeAlertAndPublish(
    cmd: AcknowledgeAlertCommand
  ): Promise<{ event: IntelligenceAlertAcknowledged; state: AlertState }> {
    const { event, state } = this.service.acknowledgeAlert(cmd);
    await this.publish("intelligence.alerts", event);
    return { event, state };
  }

  public async resolveAlertAndPublish(
    cmd: ResolveAlertCommand
  ): Promise<{ event: IntelligenceAlertResolved; state: AlertState }> {
    const { event, state } = this.service.resolveAlert(cmd);
    await this.publish("intelligence.alerts", event);
    return { event, state };
  }

  private async publish(topic: string, event: AlertEvent): Promise<void> {
    await this.eventBus.publish(topic, event);
  }
}