import { Router } from "express";
import { validateEngagementEventEnvelopeV1, EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { FormationService } from "../../services/formation/formationService";

export const formationEventsRouter = Router();

const service = new FormationService(new AzureTableFormationEventsRepository());

formationEventsRouter.post("/events", async (req, res, next) => {
  try {
    const parsed = validateEngagementEventEnvelopeV1(req.body);
    if (!parsed.ok) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body validation failed",
          details: parsed.issues.map((i: { path: string; message: string }) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    }

    const body = parsed.value as EngagementEventEnvelopeV1;
    await service.appendEvent(body);

    return res.status(202).json({ accepted: true });
  } catch (err) {
    return next(err);
  }
});

