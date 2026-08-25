import { Router } from "express";
import { getSixWeekVisitorFollowup } from "../../functions/getSixWeekVisitorFollowup";
import { getSixWeekVisitorFollowupQueue } from "../../functions/getSixWeekVisitorFollowupQueue";
import { postSixWeekVisitorFollowup } from "../../functions/postSixWeekVisitorFollowup";
import { postSixWeekVisitorFollowupOwner } from "../../functions/postSixWeekVisitorFollowupOwner";
import { postSixWeekVisitorFollowupStatus } from "../../functions/postSixWeekVisitorFollowupStatus";
import { postSixWeekVisitorFollowupTaskOutcome } from "../../functions/postSixWeekVisitorFollowupTaskOutcome";
import { postSixWeekVisitorFollowupHistoricalCareOutcome } from "../../functions/postSixWeekVisitorFollowupHistoricalCareOutcome";
import { invokeFunction } from "../visitors/invokeFunction";

export const sixWeekFollowupsRouter = Router();

sixWeekFollowupsRouter.get(
  "/six-week-followups",
  (req, res, next) => {
    invokeFunction(getSixWeekVisitorFollowupQueue, req, res).catch(next);
  }
);

sixWeekFollowupsRouter.get(
  "/visitors/:visitorId/six-week-followup",
  (req, res, next) => {
    invokeFunction(getSixWeekVisitorFollowup, req, res).catch(next);
  }
);

sixWeekFollowupsRouter.post(
  "/visitors/:visitorId/six-week-followup",
  (req, res, next) => {
    invokeFunction(postSixWeekVisitorFollowup, req, res).catch(next);
  }
);

sixWeekFollowupsRouter.post(
  "/visitors/:visitorId/six-week-followup/owner",
  (req, res, next) => {
    invokeFunction(postSixWeekVisitorFollowupOwner, req, res).catch(next);
  }
);

sixWeekFollowupsRouter.post(
  "/visitors/:visitorId/six-week-followup/tasks/:weekNumber/outcome",
  (req, res, next) => {
    invokeFunction(
      postSixWeekVisitorFollowupTaskOutcome,
      req,
      res
    ).catch(next);
  }
);

sixWeekFollowupsRouter.post(
  "/visitors/:visitorId/six-week-followup/tasks/:weekNumber/historical-care-outcome",
  (req, res, next) => {
    invokeFunction(
      postSixWeekVisitorFollowupHistoricalCareOutcome,
      req,
      res
    ).catch(next);
  }
);

sixWeekFollowupsRouter.post(
  "/visitors/:visitorId/six-week-followup/status",
  (req, res, next) => {
    invokeFunction(postSixWeekVisitorFollowupStatus, req, res).catch(next);
  }
);
