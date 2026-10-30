import assert from "node:assert/strict";
import { createVisitor } from "../../src/functions/createVisitor";
import { getVisitor } from "../../src/functions/getVisitor";

type TestCase = {
  name: string;
  configuredKey: string | undefined;
  suppliedKey: string | undefined;
  expectedStatus: number;
};

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

function makeHeaders(key: string | undefined): Record<string, string> {
  return key === undefined ? {} : { "x-api-key": key };
}

async function run(): Promise<void> {
  const previousKey = process.env.HOPE_API_KEY;

  const cases: TestCase[] = [
    {
      name: "missing request key",
      configuredKey: "local-visitor-test-key",
      suppliedKey: undefined,
      expectedStatus: 401
    },
    {
      name: "incorrect request key",
      configuredKey: "local-visitor-test-key",
      suppliedKey: "incorrect-local-key",
      expectedStatus: 401
    },
    {
      name: "missing server configuration",
      configuredKey: undefined,
      suppliedKey: "local-visitor-test-key",
      expectedStatus: 500
    }
  ];

  try {
    for (const testCase of cases) {
      if (testCase.configuredKey === undefined) {
        delete process.env.HOPE_API_KEY;
      } else {
        process.env.HOPE_API_KEY = testCase.configuredKey;
      }

      let createCalls = 0;
      const createContext = makeContext();

      await createVisitor(
        createContext,
        {
          headers: makeHeaders(testCase.suppliedKey),
          body: {
            name: "Authorization Test Visitor",
            email: "visitor-auth-test@example.invalid"
          }
        },
        {
          createRecord: (async () => {
            createCalls++;
            throw new Error("UNAUTHORIZED_CREATE_STORAGE_ACCESS");
          }) as any
        }
      );

      assert.equal(
        createContext.res.status,
        testCase.expectedStatus,
        `createVisitor: ${testCase.name}`
      );
      assert.equal(
        createContext.res.body.ok,
        false,
        `createVisitor must reject: ${testCase.name}`
      );
      assert.equal(
        createCalls,
        0,
        `createVisitor must not access storage: ${testCase.name}`
      );

      let getCalls = 0;
      const getContext = makeContext();

      await getVisitor(
        getContext,
        {
          headers: makeHeaders(testCase.suppliedKey),
          params: { visitorId: "synthetic-test-id-only" }
        },
        {
          getRecord: (async () => {
            getCalls++;
            throw new Error("UNAUTHORIZED_GET_STORAGE_ACCESS");
          }) as any
        }
      );

      assert.equal(
        getContext.res.status,
        testCase.expectedStatus,
        `getVisitor: ${testCase.name}`
      );
      assert.equal(
        getContext.res.body.ok,
        false,
        `getVisitor must reject: ${testCase.name}`
      );
      assert.equal(
        getCalls,
        0,
        `getVisitor must not access storage: ${testCase.name}`
      );

      console.log(`PASS authorization rejection: ${testCase.name}`);
    }

    process.env.HOPE_API_KEY = "local-visitor-test-key";
    const headers = { "x-api-key": "local-visitor-test-key" };

    let createCalls = 0;
    const createContext = makeContext();

    await createVisitor(
      createContext,
      {
        headers,
        body: {
          name: "Authorized Test Visitor",
          email: "authorized-test@example.invalid"
        }
      },
      {
        createRecord: (async () => {
          createCalls++;
          return {
            created: true,
            visitor: { visitorId: "authorized-test-id" }
          };
        }) as any
      }
    );

    assert.equal(createCalls, 1);
    assert.equal(createContext.res.status, 201);
    assert.deepEqual(createContext.res.body, {
      ok: true,
      visitorId: "authorized-test-id"
    });

    console.log("PASS authorized visitor creation");

    let existingCreateCalls = 0;
    const existingContext = makeContext();

    await createVisitor(
      existingContext,
      {
        headers,
        body: {
          name: "Existing Test Visitor",
          email: "existing-test@example.invalid"
        }
      },
      {
        createRecord: (async () => {
          existingCreateCalls++;
          return {
            created: false,
            visitor: { visitorId: "existing-test-id" }
          };
        }) as any
      }
    );

    assert.equal(existingCreateCalls, 1);
    assert.equal(existingContext.res.status, 200);
    assert.deepEqual(existingContext.res.body, {
      ok: true,
      visitorId: "existing-test-id"
    });

    console.log("PASS authorized existing visitor response");

    let getCalls = 0;
    const getContext = makeContext();

    const visitor = {
      visitorId: "authorized-test-id",
      name: "Authorized Test Visitor"
    };

    await getVisitor(
      getContext,
      {
        headers,
        params: { visitorId: "authorized-test-id" }
      },
      {
        getRecord: (async () => {
          getCalls++;
          return visitor;
        }) as any
      }
    );

    assert.equal(getCalls, 1);
    assert.equal(getContext.res.status, 200);
    assert.deepEqual(getContext.res.body, {
      ok: true,
      visitor
    });

    console.log("PASS authorized visitor retrieval");

    let missingGetCalls = 0;
    const missingContext = makeContext();

    await getVisitor(
      missingContext,
      {
        headers,
        params: { visitorId: "missing-test-id" }
      },
      {
        getRecord: (async () => {
          missingGetCalls++;
          return null;
        }) as any
      }
    );

    assert.equal(missingGetCalls, 1);
    assert.equal(missingContext.res.status, 404);
    assert.deepEqual(missingContext.res.body, {
      ok: false,
      error: "not found"
    });

    console.log("PASS authorized visitor not-found response");
    console.log("visitorCreateGetHttpAuthorization.test.ts passed");
  } finally {
    if (previousKey === undefined) {
      delete process.env.HOPE_API_KEY;
    } else {
      process.env.HOPE_API_KEY = previousKey;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
