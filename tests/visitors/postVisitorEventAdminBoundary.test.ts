import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requireAdminStaffActorForFunction
} from "../../src/functions/_shared/adminStaffActor";
import {
  postVisitorEvent
} from "../../src/functions/postVisitorEvent";
import type {
  VisitorEventWriter
} from "../../src/services/visitors/createVisitorEvent";

const syntheticKey = "synthetic-test-only-admin-key";
const syntheticAdmin = "synthetic-admin-001";
const syntheticOther = "synthetic-other-002";

const body = {
  commandId: "123e4567-e89b-42d3-a456-426614174000",
  date: "2026-12-06",
  name: "Sunday Worship"
};

function request(key?: string, actorId?: string) {
  return {
    method: "POST",
    headers: {
      ...(key === undefined ? {} : { "x-admin-api-key": key }),
      ...(actorId === undefined ? {} : {
        "x-hope-admin-actor-id": actorId
      })
    },
    body
  };
}

const staff = async (id: string) => ({
  staffId: id,
  status: id === syntheticAdmin ? "active" : "inactive"
} as any);

function noStorageWriter(): VisitorEventWriter {
  return {
    create: async () => {
      throw new Error("Unexpected event creation");
    },
    read: async () => {
      throw new Error("Unexpected event read");
    }
  };
}

function auth(req: any) {
  return requireAdminStaffActorForFunction(req, staff);
}

async function withSettings(run: () => Promise<void>) {
  const oldKey = process.env.HOPE_ADMIN_API_KEY;
  const oldIds = process.env.HOPE_ADMIN_STAFF_IDS;

  try {
    process.env.HOPE_ADMIN_API_KEY = syntheticKey;
    process.env.HOPE_ADMIN_STAFF_IDS = syntheticAdmin;
    await run();
  } finally {
    if (oldKey === undefined) delete process.env.HOPE_ADMIN_API_KEY;
    else process.env.HOPE_ADMIN_API_KEY = oldKey;

    if (oldIds === undefined) delete process.env.HOPE_ADMIN_STAFF_IDS;
    else process.env.HOPE_ADMIN_STAFF_IDS = oldIds;
  }
}

test("missing or incorrect admin keys deny creation", async () => {
  await withSettings(async () => {
    for (const key of [undefined, "incorrect-key"]) {
      const context: any = {};

      await postVisitorEvent(
        context,
        request(key, syntheticAdmin),
        {
          authorize: auth,
          writer: noStorageWriter()
        }
      );

      assert.equal(context.res.status, 401);
    }
  });
});

test("a missing Staff actor is denied", async () => {
  await withSettings(async () => {
    const context: any = {};

    await postVisitorEvent(
      context,
      request(syntheticKey),
      {
        authorize: auth,
        writer: noStorageWriter()
      }
    );

    assert.equal(context.res.status, 401);
  });
});

test("a Staff ID outside the administrator allowlist is denied", async () => {
  await withSettings(async () => {
    const context: any = {};

    await postVisitorEvent(
      context,
      request(syntheticKey, syntheticOther),
      {
        authorize: auth,
        writer: noStorageWriter()
      }
    );

    assert.equal(context.res.status, 403);
  });
});

test("inactive configured Staff cannot create events", async () => {
  await withSettings(async () => {
    process.env.HOPE_ADMIN_STAFF_IDS = syntheticOther;

    const context: any = {};

    await postVisitorEvent(
      context,
      request(syntheticKey, syntheticOther),
      {
        authorize: auth,
        writer: noStorageWriter()
      }
    );

    assert.equal(context.res.status, 403);
  });
});

test("missing administrator configuration fails closed", async () => {
  await withSettings(async () => {
    delete process.env.HOPE_ADMIN_STAFF_IDS;

    const context: any = {};

    await postVisitorEvent(
      context,
      request(syntheticKey, syntheticAdmin),
      {
        authorize: auth,
        writer: noStorageWriter()
      }
    );

    assert.equal(context.res.status, 500);
  });
});

test("verified synthetic administrator reaches the command writer", async () => {
  await withSettings(async () => {
    const context: any = {};
    let writes = 0;

    const writer: VisitorEventWriter = {
      create: async record => {
        writes++;
        assert.equal(record.actorId, syntheticAdmin);
        return "created";
      },
      read: async () => null
    };

    await postVisitorEvent(
      context,
      request(syntheticKey, syntheticAdmin),
      {
        authorize: auth,
        writer
      }
    );

    assert.equal(context.res.status, 202);
    assert.equal(context.res.body.ok, true);
    assert.equal(writes, 1);
  });
});