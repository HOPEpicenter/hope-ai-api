import type { TableClient } from "@azure/data-tables";
import {
  ensureTable,
  getTableClient
} from "../../functions/_shared/tableClient";

const TABLE = "KioskDeviceRegistry";
const EVENT = "friends-family-2026-11-22";
const MAX_LIFETIME_SECONDS = 7200;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type DeviceStore = {
  createEntity(entity: any): Promise<unknown>;
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<any>;
};

type RegistryDeps = {
  enabled?: boolean;
  store?: DeviceStore;
  now?: () => Date;
};

function requireEnabled(deps: RegistryDeps): void {
  if (deps.enabled !== true) {
    throw new Error("KIOSK_REGISTRY_DISABLED");
  }
}

function validateId(id: string): void {
  if (typeof id !== "string" || !UUID4.test(id)) {
    throw new Error("INVALID_DEVICE_ID");
  }
}

function nowSeconds(deps: RegistryDeps): number {
  const now = (deps.now ?? (() => new Date()))();

  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error("INVALID_SERVER_TIME");
  }

  return Math.floor(now.getTime() / 1000);
}

async function storage(deps: RegistryDeps): Promise<DeviceStore> {
  if (deps.store) return deps.store;

  const client = getTableClient(TABLE);
  await ensureTable(client as TableClient);

  return client;
}

function missing(error: any): boolean {
  return Number(error?.statusCode ?? error?.status) === 404;
}

function duplicate(error: any): boolean {
  return Number(error?.statusCode ?? error?.status) === 409;
}

async function getOptional(
  store: DeviceStore,
  rowKey: string
): Promise<any | null> {
  try {
    return await store.getEntity(EVENT, rowKey);
  } catch (error) {
    if (missing(error)) return null;

    // Network, identity and storage failures are never
    // interpreted as permission to admit a device.
    throw error;
  }
}

/**
 * Called by a trusted issuer before handing out a
 * signed device pass. Never accept parameters or
 * enablement from an untrusted HTTP request.
 */
export async function registerKioskDeviceV1(
  deviceId: string,
  expiresAtSeconds: number,
  deps: RegistryDeps = {}
): Promise<void> {
  requireEnabled(deps);
  validateId(deviceId);

  const now = nowSeconds(deps);

  if (
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= now ||
    expiresAtSeconds - now > MAX_LIFETIME_SECONDS
  ) {
    throw new Error("INVALID_DEVICE_EXPIRY");
  }

  const store = await storage(deps);

  if (
    await getOptional(store, `revoke__${deviceId}`)
  ) {
    throw new Error("DEVICE_ALREADY_REVOKED");
  }

  // Atomic create only. Duplicate issuance is denied.
  await store.createEntity({
    partitionKey: EVENT,
    rowKey: `issue__${deviceId}`,
    expiresAtSeconds,
    registeredAtSeconds: now,
    status: "issued"
  });
}

/**
 * The backend must check this on EVERY accepted
 * device request, after signature verification.
 * A valid signature alone is insufficient.
 */
export async function assessKioskDeviceV1(
  deviceId: string,
  signedExpirySeconds: number,
  deps: RegistryDeps = {}
): Promise<boolean> {
  if (deps.enabled !== true) return false;

  validateId(deviceId);

  const now = nowSeconds(deps);

  if (
    !Number.isSafeInteger(signedExpirySeconds) ||
    signedExpirySeconds <= now
  ) {
    return false;
  }

  const store = await storage(deps);
  const issued = await getOptional(
    store, `issue__${deviceId}`
  );

  if (
    !issued ||
    issued.status !== "issued" ||
    issued.expiresAtSeconds !== signedExpirySeconds ||
    issued.registeredAtSeconds > now ||
    signedExpirySeconds - issued.registeredAtSeconds >
      MAX_LIFETIME_SECONDS
  ) {
    return false;
  }

  const revoked = await getOptional(
    store, `revoke__${deviceId}`
  );

  return revoked === null;
}

/**
 * Append-only revocation tombstone.
 * Concurrent or repeated revocations are safe.
 */
export async function revokeKioskDeviceV1(
  deviceId: string,
  deps: RegistryDeps = {}
): Promise<"revoked" | "already_revoked"> {
  requireEnabled(deps);
  validateId(deviceId);

  const now = nowSeconds(deps);
  const store = await storage(deps);

  try {
    await store.createEntity({
      partitionKey: EVENT,
      rowKey: `revoke__${deviceId}`,
      revokedAtSeconds: now,
      status: "revoked"
    });

    return "revoked";
  } catch (error) {
    if (duplicate(error)) return "already_revoked";
    throw error;
  }
}