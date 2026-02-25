import { Router } from "express";
import { validateBody, getValidatedBody } from "../../middleware/validate";
import {
  validateEngagementEventEnvelopeV1Strict,
  EngagementEventEnvelopeV1,
} from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

export const engagementsEventsRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

engagementsEventsRouter.post(
  "/engagements/events",
  validateBody(validateEngagementEventEnvelopeV1Strict),
  async (req, res, next) => {
    try {
      const body = getValidatedBody<EngagementEventEnvelopeV1>(req);
      await service.appendEvent(body);
      return res.status(202).json({
        ok: true,
        accepted: true,
        v: 1,
      });
    } catch (err) {
      return next(err);
    }
  }
);