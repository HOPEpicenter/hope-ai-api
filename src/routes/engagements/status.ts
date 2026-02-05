import { Router } from "express";
import { validateEngagementStatusQueryV1 } from "../../contracts/engagementStatus.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

export const engagementsStatusRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

engagementsStatusRouter.get("/engagements/status", async (req, res, next) => {
  try {
    const parsed = validateEngagementStatusQueryV1(req.query);
    if (!parsed.ok) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Query validation failed",
          details: parsed.issues.map((i: { path: string; message: string }) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    }

    const { visitorId } = parsed.value;
    const status = await service.getCurrentStatus(visitorId);

    return res.status(200).json(status);
  } catch (err) {
    return next(err);
  }
});
