import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { formationEventsRouter } from "./events";
import { formationTimelineRouter } from "./timeline";

export const formationRouter = Router();
formationRouter.use(requireApiKey);

formationRouter.use(formationEventsRouter);
formationRouter.use(formationTimelineRouter);
