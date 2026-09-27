import assert from "node:assert/strict";
import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import { AddressInfo } from "node:net";
import {
  engagementsRiskRouter
} from "../../src/routes/engagements/risk";

async function request(
  baseUrl: string,
  actorId?: string
): Promise<{
  status: number;
  body: any;
}> {
  const response = await fetch(
    `${baseUrl}/engagements/risk?visitorId=visitor-12345678`,
    {
      headers: actorId
        ? {
            "x-hope-staff-actor-id": actorId
          }
        : {}
    }
  );

  return {
    status: response.status,
    body: await response.json()
  };
}

async function run(): Promise<void> {
  const app = express();

  app.use(engagementsRiskRouter);

  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "test_internal_error"
      });
    }
  );

  const server = app.listen(0);

  try {
    const address = server.address();

    assert.ok(address);
    assert.notEqual(typeof address, "string");

    const port = (address as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    {
      const result = await request(baseUrl);

      assert.equal(result.status, 401);
      assert.equal(
        result.body.error,
        "Missing x-hope-staff-actor-id"
      );
    }

    {
      const result = await request(
        baseUrl,
        "missing-canonical-staff"
      );

      assert.equal(result.status, 403);
    }

    console.log(
      "engagementRiskAuthorization.test.ts passed"
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
