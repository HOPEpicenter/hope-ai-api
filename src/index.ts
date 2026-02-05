import express from "express";
import visitorsRouter from "./routes/visitors/visitorsRouter";
import { createOpsRouter } from "./routes/ops/opsRouter";

import { formationRouter } from "./routes/formation";

import { integrationRouter } from "./routes/integration";

import { legacyRouter } from "./routes/legacy";
import { requestIdMiddleware, errorMiddleware } from "./http/middleware";
import { requestLogMiddleware } from "./http/requestLog";
import { AzureTableVisitorsRepository, AzureTableFormationEventsRepository } from "./repositories";

const app = express();

// Health endpoint used by CI smoke test
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.use(express.json({ limit: "256kb" }));
app.use(requestIdMiddleware);
app.use(requestLogMiddleware);
// Real storage-backed repositories
const visitorsRepository = new AzureTableVisitorsRepository();
const formationEventsRepository = new AzureTableFormationEventsRepository();

app.use("/ops", createOpsRouter(visitorsRepository, formationEventsRepository));

// Public API routes
app.use("/api/visitors", visitorsRouter);
app.use("/api", formationRouter);

app.use("/api", integrationRouter);

app.use("/api", legacyRouter);
/**
 * Global JSON error handler
 * Ensures we never leak Express HTML error pages to API clients.
 */
app.use((req, res) => {
  const requestId = (req as any).requestId as string | undefined;
  res.status(404).json({
    error: "not_found",
    message: "Route not found.",
    requestId,
  });
});

app.use(errorMiddleware);
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`hope-ai-api listening on port ${port}`);
});



















// Public API routes

