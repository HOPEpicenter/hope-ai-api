import express from "express";
import { createOpsRouter } from "./routes/ops/opsRouter";

import { formationRouter } from "./routes/formation";
import { requestIdMiddleware, errorMiddleware } from "./http/middleware";
import { requestLogMiddleware } from "./http/requestLog";
import { AzureTableVisitorsRepository, AzureTableFormationEventsRepository } from "./repositories";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(requestIdMiddleware);
app.use(requestLogMiddleware);
// Real storage-backed repositories
const visitorsRepository = new AzureTableVisitorsRepository();
const formationEventsRepository = new AzureTableFormationEventsRepository();

app.use("/ops", createOpsRouter(visitorsRepository, formationEventsRepository));
app.use("/api", createOpsRouter(visitorsRepository, formationEventsRepository));


app.use("/api", formationRouter);
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










