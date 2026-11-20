import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendKioskIntakeSubmissionV1,
  inspectExistingKioskIntakeSubmissionV1
} from "../../src/repositories/kioskIntakeSubmissionsRepositoryV1";
import {
  listPendingKioskIntakeV1
} from "../../src/repositories/listPendingKioskIntakeV1";
import {
  submitKioskIntakeV1
} from "../../src/services/visitors/submitKioskIntakeV1";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const event = "friends-family-2026-11-22";
const guest = {
  name: "Synthetic QR Guest",
  email: "guest@example.invalid",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: true
};

function memoryStore() {
  const rows = new Map<string, any>();

  return {
    rows,
    async createEntity(entity: any) {
      const key = `${entity.partitionKey}/${entity.rowKey}`;

      if (rows.has(key)) {
        const error: any = new Error("duplicate");
        error.statusCode = 409;
        throw error;
      }

      rows.set(key, { ...entity });
    },
    async getEntity(partitionKey: string, rowKey: string) {
      const result = rows.get(`${partitionKey}/${rowKey}`);

      if (!result) {
        const error: any = new Error("not found");
        error.statusCode = 404;
        throw error;
      }

      return { ...result };
    }
  };
}

test("original iPad source remains default", async () => {
  const table = memoryStore();

  const result = await appendKioskIntakeSubmissionV1(
    guest, id, { table, enabled: true }
  );

  assert.equal(result.status, "recorded");
  assert.equal(
    table.rows.get(`${event}/${id}`).source,
    "hope_ipad_kiosk_v1"
  );
});

test("authorized QR persistence retains QR provenance", async () => {
  const table = memoryStore();

  const result = await appendKioskIntakeSubmissionV1(
    guest, id, {
      table,
      enabled: true,
      source: "hope_guest_qr_v1"
    }
  );

  assert.equal(result.status, "recorded");
  assert.equal(
    table.rows.get(`${event}/${id}`).source,
    "hope_guest_qr_v1"
  );
});

test("QR retries require matching source", async () => {
  const table = memoryStore();

  await appendKioskIntakeSubmissionV1(guest, id, {
    table,
    enabled: true,
    source: "hope_guest_qr_v1"
  });

  assert.equal(
    await inspectExistingKioskIntakeSubmissionV1(
      guest, id, {
        table,
        enabled: true,
        source: "hope_guest_qr_v1"
      }
    ),
    "already_recorded"
  );

  assert.equal(
    await inspectExistingKioskIntakeSubmissionV1(
      guest, id, { table, enabled: true }
    ),
    "idempotency_conflict"
  );
});

test("cross-channel retry cannot impersonate iPad", async () => {
  const table = memoryStore();

  await appendKioskIntakeSubmissionV1(guest, id, {
    table,
    enabled: true,
    source: "hope_guest_qr_v1"
  });

  const result = await appendKioskIntakeSubmissionV1(
    guest, id, { table, enabled: true }
  );

  assert.equal(result.status, "idempotency_conflict");
  assert.equal(table.rows.size, 1);
});

test("unknown provenance is rejected before persistence", async () => {
  const table = memoryStore();

  const result = await appendKioskIntakeSubmissionV1(
    guest, id, {
      table,
      enabled: true,
      source: "untrusted" as any
    }
  );

  assert.equal(result.status, "invalid");
  assert.equal(table.rows.size, 0);
});

test("trusted service passes QR provenance to persistence", async () => {
  const old = process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;

  process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED = "true";

  try {
    const result = await submitKioskIntakeV1(
      guest, id, {
        source: "hope_guest_qr_v1",
        authorizeRequest: async () => true,
        persist: async (_input, _id, options) => {
          assert.equal(options?.enabled, true);
          assert.equal(options?.source, "hope_guest_qr_v1");
          return { accepted: true, status: "recorded" };
        }
      }
    );

    assert.equal(result.status, "recorded");
  } finally {
    if (old === undefined) {
      delete process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;
    } else {
      process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED = old;
    }
  }
});

test("authorized review recognizes QR registration", async () => {
  const table = memoryStore();

  await appendKioskIntakeSubmissionV1(guest, id, {
    table,
    enabled: true,
    source: "hope_guest_qr_v1"
  });

  const entity = table.rows.get(`${event}/${id}`);

  const store = {
    listEntities() {
      return {
        byPage() {
          return {
            async *[Symbol.asyncIterator]() {
              yield [entity];
            }
          };
        }
      };
    }
  };

  const result = await listPendingKioskIntakeV1({
    enabled: true,
    authorized: true,
    store
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, guest.name);
  assert.equal(result.hasMore, false);
});