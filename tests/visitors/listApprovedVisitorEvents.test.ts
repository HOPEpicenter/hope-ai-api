import assert from "node:assert/strict";
import { test } from "node:test";
import { listApprovedVisitorEvents } from "../../src/services/visitors/listApprovedVisitorEvents";

const date = "2026-11-29";
const partitionKey = "directory";

test("approved church events are loaded from the trusted directory", async () => {
  const events = await listApprovedVisitorEvents(date, {
    readRows: async function* () {
      yield {
        partitionKey,
        date,
        rowKey: "worship-2026-11-29",
        name: "Sunday Worship",
        active: true
      };
      yield {
        partitionKey,
        date,
        rowKey: "prayer-2026-11-29",
        name: "Prayer Meeting",
        active: true
      };
    }
  });

  assert.deepEqual(events.map(event => event.id), [
    "worship-2026-11-29",
    "prayer-2026-11-29"
  ]);
});

test("an empty event directory returns no approved events", async () => {
  const events = await listApprovedVisitorEvents(date, {
    readRows: async function* () {}
  });

  assert.deepEqual(events, []);
});

test("malformed and duplicate directory records fail closed", async () => {
  const row = {
    partitionKey,
    date,
    rowKey: "worship-2026-11-29",
    name: "Worship",
    active: true
  };

  await assert.rejects(
    listApprovedVisitorEvents(date, {
      readRows: async function* () {
        yield row;
        yield row;
      }
    })
  );

  await assert.rejects(
    listApprovedVisitorEvents(date, {
      readRows: async function* () {
        yield { ...row, active: "yes" };
      }
    })
  );
});

test("storage failures are not interpreted as an empty directory", async () => {
  await assert.rejects(
    listApprovedVisitorEvents(date, {
      readRows: async function* () {
        throw new Error("Storage unavailable");
      }
    }),
    /Storage unavailable/
  );
});

test("invalid calendar dates are rejected before reading storage", async () => {
  await assert.rejects(
    listApprovedVisitorEvents("2026-02-30", {
      readRows: async function* () {
        throw new Error("Unexpected read");
      }
    }),
    /Invalid visitor event date/
  );
});