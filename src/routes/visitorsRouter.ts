import { Router } from "express";
import { createVisitorAdapter } from "./visitors/createVisitorAdapter";
import { getVisitorAdapter } from "./visitors/getVisitorAdapter";
import { listVisitorsAdapter } from "./visitors/listVisitorsAdapter";

const visitorsRouter = Router();

visitorsRouter.post("/", createVisitorAdapter);
visitorsRouter.get("/", listVisitorsAdapter);
visitorsRouter.get("/:id", getVisitorAdapter);

export default visitorsRouter;