import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { validateLegacyExportQueryV1 } from "../../contracts/legacyExport.v1";
import { AzureTableVisitorsRepository } from "../../repositories/visitorsRepository";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { LegacyExportService } from "../../services/legacy/legacyExportService";

export const legacyRouter = Router();

// Scope auth to /legacy only
legacyRouter.use("/legacy", requireApiKey);

const service = new LegacyExportService(
  new AzureTableVisitorsRepository(),
  new EngagementEventsRepository(),
  new AzureTableFormationEventsRepository()
);

legacyRouter.get("/legacy/export", async (req, res, next) => {
  try {
    const parsed = validateLegacyExportQueryV1(req.query);
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

    const { visitorId, limit } = parsed.value;
    const payload = await service.exportVisitor(visitorId, limit);

    return res.status(200).json(payload);
  } catch (err) {
    return next(err);
  }
});

