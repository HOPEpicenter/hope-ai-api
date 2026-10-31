import assert from "node:assert/strict";


type Handler = (context: any, req: any) => Promise<void>;



const cases = [
  {
    name: "missing request key",
    configuredKey: "synthetic-person360-key",
    suppliedKey: undefined,
    expectedStatus: 401,
    expectedError: "Missing x-api-key"
  },
  {
    name: "invalid request key",
    configuredKey: "synthetic-person360-key",
    suppliedKey: "synthetic-invalid-key",
    expectedStatus: 401,
    expectedError: "Invalid x-api-key"
  },
  {
    name: "missing server configuration",
    configuredKey: undefined,
    suppliedKey: "synthetic-person360-key",
    expectedStatus: 500,
    expectedError: "Server missing HOPE_API_KEY"
  }
] as const;

function makeContext(): any {
  return {
    res: undefined,
    log: Object.assign(() => undefined, {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined
    })
  };
}

function makeRequest(key: string | undefined): any {
  return {
    params: { id: "synthetic-person360-id" },
    headers: key === undefined ? {} : { "x-api-key": key }
  };
}

async function run(): Promise<void> {
  const previousKey = process.env.HOPE_API_KEY;
  const previousFlag = process.env.FEATURE_PHASE4_AGGREGATION;
  const previousStorage = process.env.STORAGE_CONNECTION_STRING;

  try {
    process.env.FEATURE_PHASE4_AGGREGATION = "false";
    process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";

    const { getPersonAggregate } = await import("../../src/functions/getPersonAggregate");
    const { getPersonReadiness } = await import("../../src/functions/getPersonReadiness");
    const { getPersonSnapshot } = await import("../../src/functions/getPersonSnapshot");
    const { getPersonTimeline } = await import("../../src/functions/getPersonTimeline");
    const { handlePhase4AggregationRead } = await import("../../src/functions/_shared/phase4Aggregation");

    const handlers: Array<{ name: string; handler: Handler }> = [
      { name: "getPersonAggregate", handler: getPersonAggregate },
      { name: "getPersonReadiness", handler: getPersonReadiness },
      { name: "getPersonSnapshot", handler: getPersonSnapshot },
      { name: "getPersonTimeline", handler: getPersonTimeline }
    ];

    for (const testCase of cases) {
      if (testCase.configuredKey === undefined) {
        delete process.env.HOPE_API_KEY;
      } else {
        process.env.HOPE_API_KEY = testCase.configuredKey;
      }

      for (const { name, handler } of handlers) {
        const context = makeContext();

        await handler(context, makeRequest(testCase.suppliedKey));

        assert.equal(
          context.res?.status,
          testCase.expectedStatus,
          `${name}: ${testCase.name}`
        );
        assert.equal(context.res?.body?.ok, false);
        assert.equal(
          context.res?.body?.error,
          testCase.expectedError,
          `${name}: ${testCase.name}`
        );

        console.log(`PASS ${name}: ${testCase.name}`);
      }

      let readerCalls = 0;
      const context = makeContext();

      await handlePhase4AggregationRead(
        context,
        makeRequest(testCase.suppliedKey),
        aggregate => ({ aggregate }),
        {
          readAggregate: (async () => {
            readerCalls++;
            throw new Error("UNAUTHORIZED_AGGREGATION_READER_ACCESS");
          }) as any
        }
      );

      assert.equal(context.res?.status, testCase.expectedStatus);
      assert.equal(context.res?.body?.ok, false);
      assert.equal(context.res?.body?.error, testCase.expectedError);
      assert.equal(
        readerCalls,
        0,
        `Unauthorized request reached reader: ${testCase.name}`
      );

      console.log(`PASS shared reader isolation: ${testCase.name}`);
    }

    console.log("person360HttpAuthorization.test.ts passed");
  } finally {
    if (previousKey === undefined) {
      delete process.env.HOPE_API_KEY;
    } else {
      process.env.HOPE_API_KEY = previousKey;
    }

    if (previousFlag === undefined) {
      delete process.env.FEATURE_PHASE4_AGGREGATION;
    } else {
      process.env.FEATURE_PHASE4_AGGREGATION = previousFlag;
    }

    if (previousStorage === undefined) {
      delete process.env.STORAGE_CONNECTION_STRING;
    } else {
      process.env.STORAGE_CONNECTION_STRING = previousStorage;
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
