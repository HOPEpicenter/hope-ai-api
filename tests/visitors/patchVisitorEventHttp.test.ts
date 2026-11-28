import assert from "node:assert/strict";
import { test } from "node:test";
import {
  patchVisitorEvent
} from "../../src/functions/patchVisitorEvent";
import {
  requireAdminStaffActorForFunction
} from "../../src/functions/_shared/adminStaffActor";
import type {
  VisitorEventUpdateRepository,
  VersionedVisitorEvent
} from "../../src/services/visitors/updateVisitorEvent";

const adminId = "synthetic-hope-admin";
const adminKey = "synthetic-hope-admin-key";

const command = {
  method: "PATCH",
  headers: {
    "x-admin-api-key": adminKey,
    "x-hope-admin-actor-id": adminId
  },
  body: {
    commandId: "123e4567-e89b-42d3-a456-426614174000",
    eventId: "church-event-example",
    name: "Evening Worship"
  }
};

async function withAdminSettings(
  action: () => Promise<void>
): Promise<void> {
  const oldKey = process.env.HOPE_ADMIN_API_KEY;
  const oldIds = process.env.HOPE_ADMIN_STAFF_IDS;

  try {
    process.env.HOPE_ADMIN_API_KEY = adminKey;
    process.env.HOPE_ADMIN_STAFF_IDS = adminId;
    await action();
  } finally {
    if (oldKey === undefined) {
      delete process.env.HOPE_ADMIN_API_KEY;
    } else {
      process.env.HOPE_ADMIN_API_KEY = oldKey;
    }

    if (oldIds === undefined) {
      delete process.env.HOPE_ADMIN_STAFF_IDS;
    } else {
      process.env.HOPE_ADMIN_STAFF_IDS = oldIds;
    }
  }
}

function authorize(req: any) {
  return requireAdminStaffActorForFunction(
    req,
    async id => ({
      staffId: id,
      status: id === adminId ? "active" : "inactive"
    } as any)
  );
}

function memory() {
  let state: VersionedVisitorEvent = {
    event: {
      id: "church-event-example",
      date: "2026-12-06",
      name: "Morning Worship",
      active: true
    },
    version: "v1"
  };

  let writes = 0;

  const history = new Map<string, {
    eventId: string;
    fingerprint: string;
    active: boolean;
  }>();

  const repository: VisitorEventUpdateRepository = {
    readCommand: async id => history.get(id) ?? null,
    read: async id =>
      id === state.event.id
        ? { ...state, event: { ...state.event } }
        : null,

    updateIfVersion: async (
      event, version, commandId, fingerprint
    ) => {
      if (state.version !== version) return false;

      writes++;
      history.set(commandId, {
        eventId: event.id,
        fingerprint,
        active: event.active
      });

      state = {
        event: { ...event },
        version: `v${writes + 1}`,
        lastCommandId: commandId,
        lastCommandFingerprint: fingerprint
      };

      return true;
    }
  };

  return {
    repository,
    getState: () => state,
    getWrites: () => writes
  };
}

test("missing administrator credentials prevent updates", async () => {
  await withAdminSettings(async () => {
    const context: any = {};

    await patchVisitorEvent(context, {
      ...command,
      headers: {}
    }, {
      authorize,
      repository: memory().repository
    });

    assert.equal(context.res.status, 401);
  });
});

test("inactive Staff cannot update an event", async () => {
  await withAdminSettings(async () => {
    const context: any = {};

    await patchVisitorEvent(context, {
      ...command,
      headers: {
        "x-admin-api-key": adminKey,
        "x-hope-admin-actor-id": "inactive-staff"
      }
    }, {
      authorize,
      repository: memory().repository
    });

    assert.equal(context.res.status, 403);
  });
});

test("authorized Staff can change an event name", async () => {
  await withAdminSettings(async () => {
    const state = memory();
    const context: any = {};

    await patchVisitorEvent(context, command, {
      authorize,
      repository: state.repository
    });

    assert.equal(context.res.status, 202);
    assert.equal(context.res.body.ok, true);
    assert.equal(state.getState().event.name, "Evening Worship");
    assert.equal(state.getWrites(), 1);
  });
});

test("authorized Staff can deactivate without deleting identity", async () => {
  await withAdminSettings(async () => {
    const state = memory();
    const context: any = {};

    await patchVisitorEvent(context, {
      ...command,
      body: {
        ...command.body,
        name: undefined,
        active: false
      }
    }, {
      authorize,
      repository: state.repository
    });

    assert.equal(context.res.status, 202);
    assert.equal(state.getState().event.active, false);
    assert.equal(
      state.getState().event.id,
      "church-event-example"
    );
  });
});

test("an exact retry returns its receipt without writing again", async () => {
  await withAdminSettings(async () => {
    const state = memory();
    const first: any = {};
    const second: any = {};
    const deps = {
      authorize,
      repository: state.repository
    };

    await patchVisitorEvent(first, command, deps);
    await patchVisitorEvent(second, command, deps);

    assert.equal(first.res.status, 202);
    assert.equal(second.res.status, 200);
    assert.equal(second.res.body.replay, true);
    assert.equal(state.getWrites(), 1);
  });
});

test("forged actor and unexpected fields are rejected", async () => {
  await withAdminSettings(async () => {
    const state = memory();
    const context: any = {};

    await patchVisitorEvent(context, {
      ...command,
      body: {
        ...command.body,
        actorId: "forged-admin"
      }
    }, {
      authorize,
      repository: state.repository
    });

    assert.equal(context.res.status, 400);
    assert.equal(state.getWrites(), 0);
  });
});

test("wrong method cannot update events", async () => {
  await withAdminSettings(async () => {
    const state = memory();
    const context: any = {};

    await patchVisitorEvent(context, {
      ...command,
      method: "GET"
    }, {
      authorize,
      repository: state.repository
    });

    assert.equal(context.res.status, 405);
    assert.equal(state.getWrites(), 0);
  });
});

test("storage failures cannot return success", async () => {
  await withAdminSettings(async () => {
    const context: any = {};

    await patchVisitorEvent(context, command, {
      authorize,
      repository: {
        readCommand: async () => {
          throw new Error("Synthetic storage unavailable");
        },
        read: async () => null,
        updateIfVersion: async () => false
      }
    });

    assert.equal(context.res.status, 503);
    assert.equal(context.res.body.ok, false);
  });
});