import { Router, type Request, type Response } from "express";
import { getCareCandidates } from "../../functions/getCareCandidates";
import { getCareCandidate } from "../../functions/getCareCandidate";
import { getCareSummary } from "../../functions/getCareSummary";
import { getCareExport } from "../../functions/getCareExport";
import { postCareCandidateAssign } from "../../functions/postCareCandidateAssign";
import { postCareCandidateUnassign } from "../../functions/postCareCandidateUnassign";
import { postCareCandidateAssignBulk } from "../../functions/postCareCandidateAssignBulk";
import { postCareCandidateUnassignBulk } from "../../functions/postCareCandidateUnassignBulk";

type AzureFunctionHandler = (context: any, req: any) => Promise<void>;

async function invokeFunction(
  handler: AzureFunctionHandler,
  req: Request,
  res: Response
): Promise<void> {
  const context: any = {
    log: Object.assign(
      (...args: any[]) => console.log(...args),
      {
        warn: (...args: any[]) => console.warn(...args),
        error: (...args: any[]) => console.error(...args),
        info: (...args: any[]) => console.info(...args)
      }
    ),
    res: undefined
  };

  await handler(context, req);

  const result = context.res ?? {};
  const status = Number(result.status ?? 200);
  const headers = result.headers ?? {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      res.setHeader(key, value);
    }
  }

  res.status(status).json(result.body ?? {});
}

export const careRouter = Router();

careRouter.get("/care/summary", (req, res, next) => {
  invokeFunction(getCareSummary, req, res).catch(next);
});

careRouter.get("/care/export", (req, res, next) => {
  invokeFunction(getCareExport, req, res).catch(next);
});

careRouter.get("/care/candidates", (req, res, next) => {
  invokeFunction(getCareCandidates, req, res).catch(next);
});

careRouter.get("/care/candidates/:visitorId", (req, res, next) => {
  invokeFunction(getCareCandidate, req, res).catch(next);
});

careRouter.post("/care/candidates/assign-bulk", (req, res, next) => {
  invokeFunction(postCareCandidateAssignBulk, req, res).catch(next);
});

careRouter.post("/care/candidates/unassign-bulk", (req, res, next) => {
  invokeFunction(postCareCandidateUnassignBulk, req, res).catch(next);
});

careRouter.post("/care/candidates/:visitorId/assign", (req, res, next) => {
  invokeFunction(postCareCandidateAssign, req, res).catch(next);
});

careRouter.post("/care/candidates/:visitorId/unassign", (req, res, next) => {
  invokeFunction(postCareCandidateUnassign, req, res).catch(next);
});