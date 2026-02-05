import { Router } from "express";
import { validateBody, getValidatedBody } from "../../middleware/validate";
import { validateEngagementEventEnvelopeV1, EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

export const engagementsEventsRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

engagementsEventsRouter.post(
  "/engagements/events",
  validateBody(validateEngagementEventEnvelopeV1),
  async (req, res, next) => {
    try {
      const body = getValidatedBody<EngagementEventEnvelopeV1>(req);
      await service.appendEvent(body);
      return res.status(202).json({ accepted: true });
    } catch (err) {
      return next(err);
    }
  }
);
