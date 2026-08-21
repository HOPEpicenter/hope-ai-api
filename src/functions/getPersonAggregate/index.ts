import { handlePhase4AggregationRead } from "../_shared/phase4Aggregation";

export async function getPersonAggregate(context: any, req: any): Promise<void> {
  return handlePhase4AggregationRead(context, req, aggregate => ({ aggregate }));
}