import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { formationEventsRouter } from "./events";
import { formationTimelineRouter } from "./timeline";

export const formationRouter = Router();

// Apply API key only to /formation/* (never affect /visitors, /engagements, etc.)
formationRouter.use("/formation", requireApiKey);

formationRouter.use("/formation", formationEventsRouter);
formationRouter.use("/formation", formationTimelineRouter);
