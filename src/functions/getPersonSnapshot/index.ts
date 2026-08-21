import { handlePhase4AggregationRead } from "../_shared/phase4Aggregation";

export async function getPersonSnapshot(context: any, req: any): Promise<void> {
  return handlePhase4AggregationRead(context, req, aggregate => ({ visitorId: aggregate.visitorId, snapshot: aggregate.snapshot }));
}