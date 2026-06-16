import { Router, type Request, type Response } from "express";
import { getActivityIntelligence } from "../../functions/getActivityIntelligence";
import { getOpportunityWorklist } from "../../functions/getOpportunityWorklist";

type AzureFunctionHandler = (context: any, req: any) => Promise<void>;

async function invokeFunction(
  handler: AzureFunctionHandler,
  req: Request,
  res: Response
): Promise<void> {
  const context: any = {
    log: Object.assign((...args: any[]) => console.log(...args), {
      warn: (...args: any[]) => console.warn(...args),
      error: (...args: any[]) => console.error(...args),
      info: (...args: any[]) => console.info(...args)
    }),
    res: undefined
  };

  await handler(context, req);

  const result = context.res ?? {};
  res.status(Number(result.status ?? 200)).json(result.body ?? {});
}

export const activityIntelligenceRouter = Router();

activityIntelligenceRouter.get("/activity-intelligence", (req, res, next) => {
  invokeFunction(getActivityIntelligence, req, res).catch(next);
});

activityIntelligenceRouter.get("/activity-intelligence/opportunities/:segment", (req, res, next) => {
  invokeFunction(getOpportunityWorklist, req, res).catch(next);
});