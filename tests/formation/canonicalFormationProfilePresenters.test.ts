import assert from "node:assert/strict";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { FormationProfileController } from "../../src/api/formation/formationProfile.controller";
import { createFormationProfileRoutes } from "../../src/api/formation/formationProfile.routes";
import { createGetVisitorFormationProfileAdapter } from "../../src/routes/visitors/createGetVisitorFormationProfileAdapter";
import { CanonicalFormationProfileReader } from "../../src/services/formation/canonicalFormationProfileReader";
import { requireApiKey } from "../../src/shared/auth/requireApiKey";

const memberId = "member-presenter";
const rows: Record<string, unknown>[] = [
  {
    id: "started",
    type: "PathwayStarted",
    occurredAt: "2026-09-01T00:00:00.000Z",
    metadata: JSON.stringify({
      pathwayId: "pathway-1",
      pathwayType: "new-believer",
      startedAt: "2026-09-01T00:00:00.000Z",
      initialStepId: "welcome"
    })
  },
  {
    id: "stalled",
    type: "StepStalledDetected",
    occurredAt: "2026-09-02T00:00:00.000Z",
    metadata: JSON.stringify({
      pathwayId: "pathway-1",
      stepId: "group",
      stalledSince: "2026-09-02T00:00:00.000Z"
    })
  },
  {
    id: "completed",
    type: "PathwayCompleted",
    occurredAt: "2026-09-03T00:00:00.000Z",
    metadata: JSON.stringify({
      pathwayId: "pathway-1",
      completedAt: "2026-09-03T00:00:00.000Z",
      finalStepId: "commissioned"
    })
  }
];

function readerFor(entities: readonly Record<string, unknown>[]) {
  return new CanonicalFormationProfileReader({
    async listByMemberId() {
      return entities;
    }
  });
}

async function withServer(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function run(): Promise<void> {
  const productionComposition = readFileSync(
    resolve(__dirname, "../../src/index.ts"),
    "utf8"
  );
  assert.doesNotMatch(productionComposition, /new FormationProfileIndex\s*\(/);

  const controller = new FormationProfileController(readerFor(rows));
  assert.equal((await controller.getActivePathway(memberId)), null);
  assert.equal((await controller.getHistory(memberId)).length, 1);
  assert.equal((await controller.getStalledSteps(memberId)).length, 1);

  const originalApiKey = process.env.HOPE_API_KEY;
  process.env.HOPE_API_KEY = "formation-profile-test-key";
  try {
    const app = express();
    app.use("/api", requireApiKey, createFormationProfileRoutes(controller));
    await withServer(app, async (baseUrl) => {
      const unauthorized = await fetch(`${baseUrl}/api/formation/profile/${memberId}`);
      assert.equal(unauthorized.status, 401);

      const authorized = await fetch(`${baseUrl}/api/formation/profile/${memberId}`, {
        headers: { "x-api-key": "formation-profile-test-key" }
      });
      assert.equal(authorized.status, 200);
      assert.equal((await authorized.json() as { history: unknown[] }).history.length, 1);
    });
  } finally {
    if (originalApiKey === undefined) delete process.env.HOPE_API_KEY;
    else process.env.HOPE_API_KEY = originalApiKey;
  }

  const failingApp = express();
  failingApp.use(
    "/api",
    createFormationProfileRoutes(new FormationProfileController(
      new CanonicalFormationProfileReader({
        async listByMemberId() {
          throw new Error("formation-storage-test-failure");
        }
      })
    ))
  );
  failingApp.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({
      error: "test_internal_error",
      message: error.message
    });
  });
  await withServer(failingApp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/formation/profile/member-failure`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "test_internal_error",
      message: "formation-storage-test-failure"
    });
  });

  const noEventController = new FormationProfileController(readerFor([]));
  assert.equal(await noEventController.getProfile("member-none"), null);
  const visitorApp = express();
  visitorApp.get("/visitors/:id/dashboard-card/formation-profile", createGetVisitorFormationProfileAdapter(readerFor([])));
  await withServer(visitorApp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/visitors/member-none/dashboard-card/formation-profile`);
    assert.equal(response.status, 200);
    const body = await response.json() as { profile: { memberId: string; lastUpdatedAt: string | null } };
    assert.equal(body.profile.memberId, "member-none");
    assert.equal(body.profile.lastUpdatedAt, null);
  });

  console.log("canonicalFormationProfilePresenters.test.ts passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});