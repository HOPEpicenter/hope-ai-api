import express from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import visitorsRouter from "./routes/visitors/visitorsRouter";
import { createOpsRouter } from "./routes/ops/opsRouter";
import { formationRouter } from "./routes/formation";
import { formationEventsRouter } from "./routes/formationEvents";
import { followupQueueRouter } from "./routes/followupQueue";
import { engagementsRouter } from "./routes/engagements";
import { integrationRouter } from "./routes/integration";
import { legacyRouter } from "./routes/legacy";
import { requestIdMiddleware, errorMiddleware } from "./http/middleware";
import { requestLogMiddleware } from "./http/requestLog";
import { AzureTableVisitorsRepository, AzureTableFormationEventsRepository } from "./repositories";
import { opsFollowupsRouter } from "./routes/opsFollowups";
import dashboardRouter from "./routes/dashboard";
import opsParityRouter from "./routes/opsParity";
import protectedRouter from "./routes/protected";
import { careRouter } from "./routes/care";
import { activityIntelligenceRouter } from "./routes/activityIntelligence";
import { sixWeekFollowupsRouter } from "./routes/sixWeekFollowups";
import { FormationProfileController } from "./api/formation/formationProfile.controller";
import { createFormationProfileRoutes } from "./api/formation/formationProfile.routes";
import { FormationProfileIndex } from "./domain/formation/formationProfile.index";
import { CareController } from "./api/care/care.controller";
import { createCareRoutes } from "./api/care/care.routes";
import { CareProfileIndex } from "./domain/care/careProfile.index";
import { ServingController } from "./api/serving/serving.controller";
import { createServingRoutes } from "./api/serving/serving.routes";
import { ServingProfileIndex } from "./domain/serving/servingProfile.index";
import { CommunityController } from "./api/community/community.controller";
import { createCommunityRoutes } from "./api/community/community.routes";
import { CommunityProfileIndex } from "./domain/community/communityProfile.index";
import { GivingController } from "./api/giving/giving.controller";
import { createGivingRoutes } from "./api/giving/giving.routes";
import { GivingProfileIndex } from "./domain/giving/givingProfile.index";
import { AttendanceController } from "./api/attendance/attendance.controller";
import { createAttendanceRoutes } from "./api/attendance/attendance.routes";
import { AttendanceProfileIndex } from "./domain/attendance/attendanceProfile.index";
import { EngagementController } from "./api/engagement/engagement.controller";
import { createEngagementRoutes } from "./api/engagement/engagement.routes";
import { EngagementProfileIndex } from "./domain/engagement/engagementProfile.index";
import { MinistryHealthController } from "./api/ministryHealth/ministryHealth.controller";
import { createMinistryHealthRoutes } from "./api/ministryHealth/ministryHealth.routes";
import { AiModelingController } from "./api/aiModeling/aiModeling.controller";
import { createAiModelingRoutes } from "./api/aiModeling/aiModeling.routes";
import { PredictiveIntelligenceController } from "./api/predictiveIntelligence/predictiveIntelligence.controller";
import { createPredictiveIntelligenceRoutes } from "./api/predictiveIntelligence/predictiveIntelligence.routes";
import { MemberJourneyController } from "./api/memberJourney/memberJourney.controller";
import { createMemberJourneyRoutes } from "./api/memberJourney/memberJourney.routes";
import { WorkloadOptimizationController } from "./api/workloadOptimization/workloadOptimization.controller";
import { createWorkloadOptimizationRoutes } from "./api/workloadOptimization/workloadOptimization.routes";
import { PastoralBriefingController } from "./api/pastoralBriefing/pastoralBriefing.controller";
import { createPastoralBriefingRoutes } from "./api/pastoralBriefing/pastoralBriefing.routes";

import { AzureTableEngagementsRepository } from "./repositories/engagementsRepository";
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED_REJECTION", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT_EXCEPTION", err);
  process.exit(1);
});

const app = express();
// Health endpoint used by CI smoke test
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.get("/api/version", (req, res) => {
  let name: string | undefined;
  let version: string | undefined;

  try {
    // When running from dist/, __dirname is dist/. package.json is one level up.
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { name?: string; version?: string };
    name = pkg.name;
    version = pkg.version;
  } catch {
    // best-effort; don't fail the endpoint just because package.json couldn't be read
  }

  const requestId = (req as any).requestId as string | undefined;

  res.status(200).json({
    ok: true,
    name: name ?? "hope-ai-api",
    version: version ?? "unknown",
    commit:
      process.env.GITHUB_SHA ??
      process.env.COMMIT_SHA ??
      process.env.SOURCE_VERSION ??
      "unknown",
    node: process.version,
    requestId,
  });
});

app.use(express.json({ limit: "256kb" }));
app.use(requestIdMiddleware);
app.use(requestLogMiddleware);
// Real storage-backed repositories
const visitorsRepository = new AzureTableVisitorsRepository();
const formationEventsRepository = new AzureTableFormationEventsRepository();
const engagementsRepository = new AzureTableEngagementsRepository();
const formationProfileController = new FormationProfileController(
  new FormationProfileIndex()
);
const careController = new CareController(new CareProfileIndex());
const servingController = new ServingController(new ServingProfileIndex());
const communityController = new CommunityController(new CommunityProfileIndex());
const givingController = new GivingController(new GivingProfileIndex());
const attendanceController = new AttendanceController(new AttendanceProfileIndex());
const engagementController = new EngagementController(new EngagementProfileIndex());
const ministryHealthController = new MinistryHealthController();
const aiModelingController = new AiModelingController();
const predictiveIntelligenceController = new PredictiveIntelligenceController();
const memberJourneyController = new MemberJourneyController();
const workloadOptimizationController = new WorkloadOptimizationController();
const pastoralBriefingController = new PastoralBriefingController();
app.use("/ops", createOpsRouter(visitorsRepository, formationEventsRepository, engagementsRepository));
app.use("/ops/followups", opsFollowupsRouter);
// Public API routes
app.use("/api/visitors", visitorsRouter(visitorsRepository));
// TEMP parity alias for CI + smoke tests
app.use("/visitors", visitorsRouter(visitorsRepository));
app.use("/api", formationEventsRouter);
app.use("/api", formationRouter);
app.use("/api", createFormationProfileRoutes(formationProfileController));
app.use("/api", createCareRoutes(careController));
app.use("/api", createServingRoutes(servingController));
app.use("/api", createCommunityRoutes(communityController));
app.use("/api", createGivingRoutes(givingController));
app.use("/api", createAttendanceRoutes(attendanceController));
app.use("/api", createEngagementRoutes(engagementController));
app.use("/api", createAiModelingRoutes(aiModelingController));
app.use("/api", createPredictiveIntelligenceRoutes(predictiveIntelligenceController));
app.use("/api", createMemberJourneyRoutes(memberJourneyController));
app.use("/api", createWorkloadOptimizationRoutes(workloadOptimizationController));
app.use("/api", createPastoralBriefingRoutes(pastoralBriefingController));
app.use("/api", followupQueueRouter);
app.use("/api", engagementsRouter);
app.use("/api", integrationRouter);
app.use("/api", careRouter);
app.use("/api", activityIntelligenceRouter);
app.use("/api", sixWeekFollowupsRouter);
app.use("/api", dashboardRouter);
app.use("/api", opsParityRouter);
app.use("/api", protectedRouter);
app.use("/api", legacyRouter);
app.use("/api", createMinistryHealthRoutes(ministryHealthController));

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


/**
 * Runtime route topology diagnostics.
 *
 * Intentionally disabled in production to avoid exposing
 * operational/transitional route surfaces.
 *
 * Local/dev debugging only.
 */
const debugRoutesEnabled =
  process.env.DEBUG_ROUTES === "1" &&
  process.env.NODE_ENV !== "production";

if (debugRoutesEnabled) {
  const seen: string[] = [];

  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (!layer) continue;

      if (layer.route?.path && layer.route?.methods) {
        const methods = Object.keys(layer.route.methods)
          .filter(k => layer.route.methods[k])
          .map(k => k.toUpperCase())
          .join(",");
        seen.push(`${methods} ${layer.route.path}`);
      }

      if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };

  walk((app as any)._router?.stack ?? []);
  console.log("[DEBUG_ROUTES] Registered routes:");
  for (const r of seen.sort()) console.log("[DEBUG_ROUTES] " + r);
}



