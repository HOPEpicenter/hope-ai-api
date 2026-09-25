import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createFormationRoutes } from "../../src/api/formation/formation.routes";
import { FormationController } from "../../src/api/formation/formation.controller";
import {
  type EventBus,
  FormationEventBusAdapter,
} from "../../src/domain/formation/formation.eventBusAdapter";
import { FormationProjection } from "../../src/domain/formation/formation.projection";
import { FormationService } from "../../src/domain/formation/formation.service";
import type { FormationEvent } from "../../src/contracts/formationEvent.v1";

class RecordingEventBus implements EventBus {
  public readonly published: Array<{ topic: string; event: unknown }> = [];

  public publish<TEvent>(topic: string, event: TEvent): void {
    this.published.push({ topic, event });
  }
}

function isFormationEvent(event: unknown): event is FormationEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    typeof event.type === "string"
  );
}

describe("Formation HTTP API", () => {
  let server: Server;
  let baseUrl: string;
  let eventBus: RecordingEventBus;

  beforeAll(async () => {
    eventBus = new RecordingEventBus();
    const controller = new FormationController(
      new FormationEventBusAdapter(new FormationService(), eventBus),
      new FormationProjection()
    );
    const app = express();

    app.use(express.json());
    app.use("/formation", createFormationRoutes(controller));

    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/formation`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function request(
    path: string,
    method = "GET",
    body?: Record<string, unknown>
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    return { status: response.status, body: await response.json() };
  }

  it("executes the pathway lifecycle and exposes its projected read models", async () => {
    const memberId = "member-123";
    const pathwayId = "pathway-abc";

    const start = await request("/start", "POST", {
      memberId,
      pathwayId,
      pathwayType: "new-believer",
      initialStepId: "welcome",
      actorId: "staff-1",
    });
    expect(start.status).toBe(200);
    expect(start.body).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          type: "PathwayStarted",
          memberId,
          pathwayId,
          actorId: "staff-1",
        }),
        state: expect.objectContaining({
          status: "in_progress",
          currentStepId: "welcome",
        }),
      })
    );

    const completedStep = await request("/step/complete", "POST", {
      memberId,
      pathwayId,
      stepId: "welcome",
      notes: "Met after service",
    });
    expect(completedStep.status).toBe(200);
    expect(completedStep.body).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ type: "StepCompleted" }),
      })
    );

    const stalledStep = await request("/step/stalled", "POST", {
      memberId,
      pathwayId,
      stepId: "group",
      stalledSince: "2026-09-01T12:00:00.000Z",
      reason: "Unable to contact",
    });
    expect(stalledStep.status).toBe(200);

    const stalled = await request("/stalled");
    expect(stalled.status).toBe(200);
    expect(stalled.body).toEqual([
      expect.objectContaining({
        pathwayId,
        status: "stalled",
        currentStepId: "welcome",
        steps: expect.arrayContaining([
          expect.objectContaining({
            stepId: "welcome",
            notes: "Met after service",
          }),
          expect.objectContaining({
            stepId: "group",
            stalledSince: "2026-09-01T12:00:00.000Z",
            reason: "Unable to contact",
          }),
        ]),
      }),
    ]);

    const complete = await request("/complete", "POST", {
      memberId,
      pathwayId,
      finalStepId: "commissioned",
    });
    expect(complete.status).toBe(200);

    const [all, byMember, active, completed, steps, unknownSteps] =
      await Promise.all([
        request("/"),
        request(`/member/${memberId}`),
        request("/active"),
        request("/completed"),
        request(`/${pathwayId}/steps`),
        request("/missing-pathway/steps"),
      ]);

    for (const response of [all, byMember, active, completed, steps, unknownSteps]) {
      expect(response.status).toBe(200);
    }
    expect(all.body).toEqual([
      expect.objectContaining({
        pathwayId,
        memberId,
        status: "completed",
        currentStepId: "commissioned",
      }),
    ]);
    expect(byMember.body).toEqual(all.body);
    expect(active.body).toEqual([]);
    expect(completed.body).toEqual(all.body);
    expect(steps.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stepId: "welcome" }),
        expect.objectContaining({ stepId: "group" }),
      ])
    );
    expect(unknownSteps.body).toEqual([]);

    expect(eventBus.published).toHaveLength(4);
    expect(
      eventBus.published.map(({ topic, event }) => [
        topic,
        isFormationEvent(event) ? event.type : undefined,
      ])
    ).toEqual([
      ["formation.events", "PathwayStarted"],
      ["formation.events", "StepCompleted"],
      ["formation.events", "StepStalledDetected"],
      ["formation.events", "PathwayCompleted"],
    ]);
  });

  it("returns an empty JSON collection for a fresh controller", async () => {
    const freshEventBus = new RecordingEventBus();
    const freshController = new FormationController(
      new FormationEventBusAdapter(new FormationService(), freshEventBus),
      new FormationProjection()
    );
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use("/formation", createFormationRoutes(freshController));
    const freshServer = await new Promise<Server>((resolve) => {
      const listener = freshApp.listen(0, "127.0.0.1", () => resolve(listener));
    });
    const address = freshServer.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/formation/`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        freshServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});