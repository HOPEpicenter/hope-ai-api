import { listVisitors } from "./visitorRepository";
import { autoGenerateTasks } from "./autoTaskRepository";

export interface DailyAutoTaskBatchResult {
  runDate: string;
  totalVisitors: number;
  processed: number;
  results: {
    visitorId: string;
    created: number;
    skipped: number;
  }[];
}

/**
 * Backward-compatible wrapper for older code that still calls
 * autoGenerateTasksForVisitor(visitorId)
 */
export async function autoGenerateTasksForVisitor(visitorId: string) {
  // No definitions passed here — your auto generator will use defaults
  const created = await autoGenerateTasks(visitorId, []);

  return {
    visitorId,
    created,
    skipped: [] // your old API shape expects this
  };
}

/**
 * Daily batch runner — loops through all visitors and auto-generates tasks
 */
export async function runDailyAutoTaskBatch(): Promise<DailyAutoTaskBatchResult> {
  const visitors = await listVisitors();
  const results: DailyAutoTaskBatchResult["results"] = [];

  let processed = 0;

  for (const v of visitors) {
    const visitorId = v.rowKey;

    const result = await autoGenerateTasksForVisitor(visitorId);

    results.push({
      visitorId,
      created: result.created.length,
      skipped: result.skipped.length
    });

    processed++;
  }

  return {
    runDate: new Date().toISOString(),
    totalVisitors: visitors.length,
    processed,
    results
  };
}
