import * as assert from "node:assert/strict";

const keys = [
  "HOPE_TABLE_AUTH_MODE",
  "HOPE_TABLE_ENDPOINT",
  "HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID",
  "STORAGE_CONNECTION_STRING",
  "AzureWebJobsStorage"
] as const;

const saved = keys.map((key) => process.env[key]);
const endpoint = "https://hopeteststorage01.table.core.windows.net";
const clientId = "11111111-2222-4333-8444-555555555555";

async function main(): Promise<void> {
  try {
    for (const key of keys) delete process.env[key];

    process.env.HOPE_TABLE_AUTH_MODE = "managed-identity";
    process.env.HOPE_TABLE_ENDPOINT = endpoint;
    process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID = clientId;

    const { VisitorRepository } = require("../../src/storage/visitorRepository");
    const { EngagementRepository } = require("../../src/storage/engagementRepository");
    const { EngagementSummaryRepository } = require("../../src/storage/engagementSummaryRepository");

    const instances = [
      new VisitorRepository(),
      new EngagementRepository(),
      new EngagementSummaryRepository()
    ];

    for (const instance of instances) {
      const client = (instance as any).client;
      assert.ok(client, "Expected repository Table client");
      assert.equal(client.url, endpoint);
    }

    process.env.HOPE_TABLE_AUTH_MODE = "invalid";

    for (const Type of [
      VisitorRepository,
      EngagementRepository,
      EngagementSummaryRepository
    ]) {
      assert.throws(
        () => new Type(),
        /Unsupported Table Storage authentication mode/
      );
    }

    console.log("repositoryTableAuthMode.test.ts passed");
  } finally {
    keys.forEach((key, i) => {
      const value = saved[i];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});