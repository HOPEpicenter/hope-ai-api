import assert from "node:assert/strict";
import { test } from "node:test";
import {
  postVisitorEvent
} from "../../src/functions/postVisitorEvent";
import type {
  StoredVisitorEvent,
  VisitorEventWriter
} from "../../src/services/visitors/createVisitorEvent";

const request = {
  method: "POST",
  body: {
    commandId: "123e4567-e89b-42d3-a456-426614174000",
    date: "2026-12-06",
    name: "Sunday Worship"
  }
};

const admin = async () => ({
  ok: true as const,
  actorId: "synthetic-admin"
});

function memoryWriter() {
  const rows = new Map<string, StoredVisitorEvent>();

  const writer: VisitorEventWriter = {
    create: async record => {
      if (rows.has(record.id)) return "exists";
      rows.set(record.id, { ...record });
      return "created";
    },
    read: async (_date, id) => rows.get(id) ?? null
  };

  return { writer, rows };
}

test("unauthorized calls cannot reach event storage", async () => {
  const context: any = {};

  await postVisitorEvent(context, request, {
    authorize: async () => ({
      ok: false,
      status: 403,
      body: { ok: false, error: "denied" }
    }),
    writer: {
      create: async () => {
        throw new Error("Unexpected storage write");
      },
      read: async () => {
        throw new Error("Unexpected storage read");
      }
    }
  });

  assert.equal(context.res.status, 403);
});

test("approved Staff actor creates one event", async () => {
  const context: any = {};
  const { writer, rows } = memoryWriter();

  await postVisitorEvent(context, request, {
    authorize: admin,
    writer
  });

  assert.equal(context.res.status, 202);
  assert.equal(context.res.body.ok, true);
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].actorId, "synthetic-admin");
});

test("a retry returns the same event without adding another", async () => {
  const { writer, rows } = memoryWriter();
  const first: any = {};
  const second: any = {};

  const dependencies = { authorize: admin, writer };

  await postVisitorEvent(first, request, dependencies);
  await postVisitorEvent(second, request, dependencies);

  assert.equal(first.res.status, 202);
  assert.equal(second.res.status, 200);
  assert.equal(second.res.body.replay, true);
  assert.equal(rows.size, 1);
});

test("public requests cannot supply an actor or event status", async () => {
  const context: any = {};
  const { writer, rows } = memoryWriter();

  await postVisitorEvent(context, {
    ...request,
    body: { ...request.body, actorId: "forged-admin" }
  }, {
    authorize: admin,
    writer
  });

  assert.equal(context.res.status, 400);
  assert.equal(rows.size, 0);
});

test("invalid methods are rejected before storage", async () => {
  const context: any = {};
  const { writer, rows } = memoryWriter();

  await postVisitorEvent(context, {
    ...request,
    method: "GET"
  }, {
    authorize: admin,
    writer
  });

  assert.equal(context.res.status, 405);
  assert.equal(rows.size, 0);
});

test("missing or invalid body cannot create an event", async () => {
  const { writer, rows } = memoryWriter();

  for (const body of [
    null,
    [],
    { commandId: "bad", date: "2026-12-06", name: "Worship" }
  ]) {
    const context: any = {};

    await postVisitorEvent(context, {
      ...request,
      body
    }, {
      authorize: admin,
      writer
    });

    assert.equal(context.res.status, 400);
  }

  assert.equal(rows.size, 0);
});

test("storage failure does not report successful creation", async () => {
  const context: any = {};

  await postVisitorEvent(context, request, {
    authorize: admin,
    writer: {
      create: async () => {
        throw new Error("Synthetic storage offline");
      },
      read: async () => null
    }
  });

  assert.equal(context.res.status, 503);
  assert.equal(context.res.body.ok, false);
});