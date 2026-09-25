import type {
  IntelligenceAlertAcknowledged,
  IntelligenceAlertRaised,
  IntelligenceAlertResolved,
} from "../../contracts/alertEvent.v1";
import {
  handleAcknowledgeAlert,
  handleRaiseAlert,
  handleResolveAlert,
  type AcknowledgeAlertCommand,
  type RaiseAlertCommand,
  type ResolveAlertCommand,
} from "./alert.commands";
import { AlertAggregate, type AlertState } from "./alert.aggregate";

export class AlertService {
  public raiseAlert(cmd: RaiseAlertCommand): {
    event: IntelligenceAlertRaised;
    state: AlertState;
  } {
    const aggregate = new AlertAggregate();
    const event = handleRaiseAlert(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public acknowledgeAlert(cmd: AcknowledgeAlertCommand): {
    event: IntelligenceAlertAcknowledged;
    state: AlertState;
  } {
    const aggregate = new AlertAggregate();
    const event = handleAcknowledgeAlert(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }

  public resolveAlert(cmd: ResolveAlertCommand): {
    event: IntelligenceAlertResolved;
    state: AlertState;
  } {
    const aggregate = new AlertAggregate();
    const event = handleResolveAlert(cmd);
    aggregate.apply(event);
    return { event, state: aggregate.getState() };
  }
}