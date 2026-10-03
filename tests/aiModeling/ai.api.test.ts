import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { AiModelingController } from "../../src/api/aiModeling/aiModeling.controller";
import { createAiModelingRoutes } from "../../src/api/aiModeling/aiModeling.routes";
import { createHealthyAiAnalyticsBundle } from "../../src/domain/aiModeling/ai.features";

describe("AI modeling HTTP API", () => {
  let server: Server;
  let baseUrl: string;
  let controller: AiModelingController;

  beforeAll(async () => {
    const app = express();
    controller = new AiModelingController();
    app.use("/api", createAiModelingRoutes(controller));
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("does not generate AI output without explicitly injected analytics", () => {
    expect(controller.getPredictions("member-1")).toBeNull();
    expect(controller.getInsights("member-1")).toEqual([]);
    expect(controller.getRecommendations("member-1")).toEqual([]);
    expect(controller.getReport("member-1")).toBeNull();
  });

  it("uses explicitly injected analytics to build the existing report", () => {
    const injected = new AiModelingController(createHealthyAiAnalyticsBundle());
    const report = injected.buildReport("member-evidence");

    expect(report).not.toBeNull();
    expect(report?.memberId).toBe("member-evidence");
    expect(injected.getPredictions("member-evidence")?.memberId).toBe("member-evidence");
    expect(injected.getInsights("member-evidence").length).toBeGreaterThan(0);
    expect(injected.getRecommendations("member-evidence").length).toBeGreaterThan(0);
    expect(injected.getInsights("member-evidence").every((item) => item.memberId === "member-evidence")).toBe(true);
    expect(injected.getRecommendations("member-evidence").every((item) => item.memberId === "member-evidence")).toBe(true);
    expect(injected.getReport("member-evidence")).toEqual(report);
  });

  it.each(["predictions", "insights", "recommendations", "report"] as const)("serves /ai/%s/:memberId", async (surface) => {
    const response = await fetch(`${baseUrl}/ai/${surface}/member-1`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      surface === "insights" || surface === "recommendations" ? [] : null
    );
  });
});