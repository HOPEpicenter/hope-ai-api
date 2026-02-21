import { AzureTableVisitorsRepository } from "./visitorsRepository";
import { AzureTableFormationEventsRepository } from "./formationEventsRepository";

export { AzureTableVisitorsRepository, AzureTableFormationEventsRepository };

export type { VisitorsRepository, Visitor, VisitorEntity } from "./visitorsRepository";
export type {
  FormationEventsRepository,
  FormationEvent,
  FormationEventEntity,
  FormationEventType,
  Page,
} from "./formationEventsRepository";

export function createRepositories() {
  return {
    visitors: new AzureTableVisitorsRepository(),
    formationEvents: new AzureTableFormationEventsRepository(),
  };
}
export * from "./engagementsRepository";

