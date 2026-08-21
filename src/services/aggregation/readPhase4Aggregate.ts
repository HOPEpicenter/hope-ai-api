import { getFeatureFlags } from "../../config/featureFlags";
import { createPersonAggregationService } from "./personAggregationService";

export class Phase4AggregationDisabledError extends Error {
  readonly code = "PHASE4_AGGREGATION_DISABLED";

  constructor() {
    super("Phase 4 aggregation is not enabled.");
  }
}

export async function readPhase4Aggregate(visitorId: string) {
  if (!getFeatureFlags().phase4Aggregation) {
    throw new Phase4AggregationDisabledError();
  }

  return createPersonAggregationService().readPersonAggregate(visitorId);
}