import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { AiModelingController } from "../../src/api/aiModeling/aiModeling.controller";
import { createAiModelingRoutes } from "../../src/api/aiModeling/aiModeling.routes";

describe("AI modeling HTTP API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use("/api", createAiModelingRoutes(new AiModelingController()));
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it.each(["predictions", "insights", "recommendations", "report"])("serves /ai/%s/:memberId", async (surface) => {
    const response = await fetch(`${baseUrl}/ai/${surface}/member-1`);
    expect(response.status).toBe(200);
  });
});