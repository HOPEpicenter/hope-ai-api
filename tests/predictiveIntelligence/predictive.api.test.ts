import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { PredictiveIntelligenceController } from "../../src/api/predictiveIntelligence/predictiveIntelligence.controller";
import { createPredictiveIntelligenceRoutes } from "../../src/api/predictiveIntelligence/predictiveIntelligence.routes";

const evidenceBackedMember = {
  risk: {
    memberId: "member-evidence",
    stallRiskScore: 0.2,
    careNeedScore: 0.3,
    disengagementRiskScore: 0.1,
    growthPotentialScore: 0.4,
    leadershipPotentialScore: 0.5,
    context: ["Evidence-backed test fixture."]
  },
  priority: {
    memberId: "member-evidence",
    priority: "low" as const,
    priorityScore: 0.5,
    rationale: "Test fixture evidence."
  },
  insights: [],
  actions: []
};

describe("predictive intelligence HTTP API", () => {
  let server: Server;
  let baseUrl: string;
  let controller: PredictiveIntelligenceController;
  beforeAll(async () => {
    const app = express();
    controller = new PredictiveIntelligenceController();
    app.use("/api", createPredictiveIntelligenceRoutes(controller));
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  it("returns no synthetic member and an unavailable empty leadership state by default", () => {
    expect(controller.getMember("member-1")).toBeNull();
    expect(controller.getLeadership()).toMatchObject({
      summary: { totalMembers: 0, ministryHealthStatus: "insufficient_data" },
      actions: [],
      report: { members: [], rankings: [], aiRecommendations: [] }
    });
    expect(controller.getActions()).toEqual([]);
    expect(controller.getReport().rankings).toEqual([]);
  });
  it("uses explicitly injected evidence for member and leadership results", () => {
    const injected = new PredictiveIntelligenceController({
      members: [evidenceBackedMember],
      ministryHealthAnalytics: {
        overallScore: 74,
        status: "healthy",
        scoresByDomain: { care: 74 },
        alertCount: 0,
        trendCounts: { stable: 1 }
      }
    });

    expect(injected.getMember("member-evidence")).toEqual(evidenceBackedMember);
    expect(injected.getMember("missing")).toBeNull();
    expect(injected.getLeadership().summary).toMatchObject({
      totalMembers: 1,
      ministryHealthStatus: "healthy"
    });
    expect(injected.getLeadership().report.members).toEqual([evidenceBackedMember]);
  });
  it("preserves HTTP 200 responses for unavailable and empty leadership states", async () => {
    const member = await fetch(`${baseUrl}/predictive/member/member-1`);
    expect(member.status).toBe(200);
    expect(await member.json()).toBeNull();

    const summary = await fetch(`${baseUrl}/predictive/leadership/summary`);
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({
      totalMembers: 0,
      ministryHealthStatus: "insufficient_data"
    });

    for (const path of ["predictive/leadership/actions", "predictive/leadership/report"]) {
      expect((await fetch(`${baseUrl}/${path}`)).status).toBe(200);
    }
  });
});