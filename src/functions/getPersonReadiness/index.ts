import { handlePhase4AggregationRead } from "../_shared/phase4Aggregation";

export async function getPersonReadiness(context: any, req: any): Promise<void> {
  return handlePhase4AggregationRead(context, req, aggregate => ({ visitorId: aggregate.visitorId, readiness: aggregate.readiness, ministryHealth: aggregate.ministryHealth }));
}