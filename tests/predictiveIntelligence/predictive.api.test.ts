import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { PredictiveIntelligenceController } from "../../src/api/predictiveIntelligence/predictiveIntelligence.controller";
import { createPredictiveIntelligenceRoutes } from "../../src/api/predictiveIntelligence/predictiveIntelligence.routes";

describe("predictive intelligence HTTP API", () => {
  let server: Server;
  let baseUrl: string;
  beforeAll(async () => {
    const app = express();
    app.use("/api", createPredictiveIntelligenceRoutes(new PredictiveIntelligenceController()));
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  it.each(["predictive/member/member-1", "predictive/leadership/summary", "predictive/leadership/actions", "predictive/leadership/report"])("serves /api/%s", async (path) => {
    expect((await fetch(`${baseUrl}/${path}`)).status).toBe(200);
  });
});