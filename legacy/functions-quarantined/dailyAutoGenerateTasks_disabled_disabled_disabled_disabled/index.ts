import { app, InvocationContext } from "@azure/functions";
import { runDailyAutoTaskBatch } from "../repositories/autoTaskBatchRepository";

app.timer("dailyAutoGenerateTasks", {
  // 8 AM Eastern = 13:00 UTC
  schedule: "0 0 13 * * *",
  handler: async (timer, context: InvocationContext) => {
    try {
      const result = await runDailyAutoTaskBatch();
      context.log("Daily auto-generation complete:", JSON.stringify(result));
    } catch (err: any) {
      context.log("Error in daily auto-generation:", err);
    }
  }
});
