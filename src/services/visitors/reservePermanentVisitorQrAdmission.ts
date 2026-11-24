import type {
  PublicVisitCommand
} from "./preparePermanentPublicVisitRegistration";

import {
  verifyPermanentPublicVisitSession
} from "./permanentPublicVisitSession";

import type {
  PermanentPublicVisitContext
} from "./resolvePermanentPublicVisitEvent";

import {
  createHash,
  createHmac
} from "node:crypto";

import {
  verifyPermanentVisitorQrGrant,
  type PermanentQrGrantContext
} from "./permanentVisitorQrGrant";

import type {
  PermanentRegistrationDependencies
} from "./submitPermanentVisitorRegistration";

type Command = Parameters<
  NonNullable<PermanentRegistrationDependencies["admit"]>
>[0]["command"];

export type ReservationRow = Readonly<{
  partitionKey: string;
  rowKey: string;
  grantId: string;
  submissionId: string;
  claimHash: string;
  slotKey: string;
}>;

/**
 * Trusted internal storage contract.
 *
 * createAll MUST atomically create every supplied row
 * in one same-partition transaction.
 *
 * No upsert, overwrite, partial insertion or
 * conflict-to-success conversion is permitted.
 *
 * read returns null only for confirmed absence.
 * Unknown storage failures must throw.
 */
export type PermanentQrReservationStore = {
  read(
    partitionKey: string,
    rowKey: string
  ): Promise<ReservationRow | null>;

  createAll(
    rows: readonly ReservationRow[]
  ): Promise<"created" | "conflict">;
};

export type PermanentQrAdmissionResult =
  | Readonly<{
      admitted: true;
      status: "reserved" | "resumed";
    }>
  | Readonly<{
      admitted: false;
      status:
        | "unavailable"
        | "denied"
        | "conflict"
        | "capacity_exhausted";
    }>;

type Dependencies = {
  enabled?: boolean;
  store?: PermanentQrReservationStore;
  context?: PermanentQrGrantContext;
  signingSecret?: string;
  claimSecret?: string;
  capacity?: number;
};

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function reject(
  status: Extract<
    PermanentQrAdmissionResult,
    { admitted: false }
  >["status"]
): PermanentQrAdmissionResult {
  return { admitted: false, status };
}

function validSecret(
  secret: unknown
): secret is string {
  return typeof secret === "string" &&
    Buffer.byteLength(secret, "utf8") >= 32 &&
    Buffer.byteLength(secret, "utf8") <= 512;
}

/**
 * Bind the complete accepted command without storing
 * raw visitor contact or family information in quota rows.
 *
 * This command must come from the validated internal
 * registration adapter, never directly from HTTP JSON.
 */
function fingerprint(
  command: Command,
  date: string,
  secret: string
): string {
  const family = "family" in command
    ? [
        command.family.guardianName,
        command.family.guardianDeclaration,
        command.family.children.map(child => [
          child.firstName,
          child.ageGroup
        ])
      ]
    : null;

  const canonical = JSON.stringify([
    "permanent-visitor-qr-claim-v1",
    date,
    command.serviceId,
    command.submissionId,
    command.name,
    command.email ?? null,
    command.phone ?? null,
    family
  ]);

  return createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("hex");
}

function matches(
  row: ReservationRow,
  expected: ReservationRow
): boolean {
  return row.partitionKey === expected.partitionKey &&
    row.rowKey === expected.rowKey &&
    row.grantId === expected.grantId &&
    row.submissionId === expected.submissionId &&
    row.claimHash === expected.claimHash &&
    row.slotKey === expected.slotKey;
}

/**
 * Internal QR reservation boundary.
 *
 * A reservation is NOT a visitor registration receipt.
 * An identical retry may resume canonical persistence,
 * but cannot announce registration success here.
 *
 * No default Azure storage dependency is supplied.
 */
export async function reservePermanentVisitorQrAdmission(
  input: Readonly<{
    token: unknown;
    command: Command;
  }>,
  deps: Dependencies = {}
): Promise<PermanentQrAdmissionResult> {
  return reservePermanentVisitorAdmissionCore<PermanentQrGrantContext>(
    input,
    deps,
    verifyPermanentVisitorQrGrant
  );
}

// Both credential paths use the same durable reservation logic.
// The permanent public path requires no device or owner activation.
type SharedAdmissionDependencies<C> =
  Omit<Dependencies, "context"> & {
    context?: C;
  };

type SharedVerifiedGrant = Readonly<{
  grantId: string;
  serviceId: string;
  date: string;
  expiresAtSeconds: number;
}>;

async function reservePermanentVisitorAdmissionCore<
  C extends { nowMs: number },
  T extends Command = Command
>(
  input: Readonly<{
    token: unknown;
    command: T;
  }>,
  deps: SharedAdmissionDependencies<C>,
  verifyGrant: (
    token: unknown,
    secret: unknown,
    context: C
  ) => SharedVerifiedGrant | null,
  hashCommand: (
    command: T,
    date: string,
    secret: string
  ) => string = fingerprint
): Promise<PermanentQrAdmissionResult> {
  try {
    const capacity = deps.capacity ?? 30;

    if (deps.enabled !== true ||
        !deps.store ||
        !deps.context ||
        !validSecret(deps.signingSecret) ||
        !validSecret(deps.claimSecret) ||
        deps.signingSecret === deps.claimSecret ||
        !Number.isSafeInteger(capacity) ||
        capacity < 1 ||
        capacity > 100) {
      return reject("unavailable");
    }

    const store = deps.store;

    const grant = verifyGrant(
      input.token,
      deps.signingSecret,
      deps.context
    );

    const command = input.command;

    if (!grant ||
        !UUID4.test(command.submissionId) ||
        command.serviceId !== grant.serviceId) {
      return reject("denied");
    }

    const partitionKey = "pv1_" + createHash("sha256")
      .update(JSON.stringify([
        grant.date,
        grant.serviceId
      ]))
      .digest("hex");

    const grantKey = `grant__${grant.grantId}`;

    const submissionKey =
      `submission__${command.submissionId}`;

    const claimHash = hashCommand(
      command,
      grant.date,
      deps.claimSecret
    );

    function makeRow(
      rowKey: string,
      slotKey: string
    ): ReservationRow {
      return {
        partitionKey,
        rowKey,
        grantId: grant!.grantId,
        submissionId: command.submissionId,
        claimHash,
        slotKey
      };
    }

    type Existing =
      | "missing"
      | "resumed"
      | "conflict"
      | "unavailable";

    async function inspectExisting(): Promise<Existing> {
      const grantRow = await store.read(
        partitionKey, grantKey
      );

      const submissionRow = await store.read(
        partitionKey, submissionKey
      );

      if (!grantRow && !submissionRow) {
        return "missing";
      }

      if (grantRow &&
          (grantRow.partitionKey !== partitionKey ||
           grantRow.rowKey !== grantKey)) {
        return "unavailable";
      }

      if (submissionRow &&
          (submissionRow.partitionKey !== partitionKey ||
           submissionRow.rowKey !== submissionKey)) {
        return "unavailable";
      }

      if (grantRow &&
          (grantRow.submissionId !== command.submissionId ||
           grantRow.claimHash !== claimHash)) {
        return "conflict";
      }

      if (submissionRow &&
          (submissionRow.grantId !== grant!.grantId ||
           submissionRow.claimHash !== claimHash)) {
        return "conflict";
      }

      // Missing or inconsistent transaction rows are
      // never proof of a completed reservation.
      if (!grantRow || !submissionRow ||
          !/^slot__\d+__\d{3}$/.test(grantRow.slotKey)) {
        return "unavailable";
      }

      const slotKey = grantRow.slotKey;

      if (!matches(grantRow, makeRow(grantKey, slotKey)) ||
          !matches(submissionRow,
            makeRow(submissionKey, slotKey))) {
        return "unavailable";
      }

      const slotRow = await store.read(
        partitionKey, slotKey
      );

      if (!slotRow ||
          !matches(slotRow, makeRow(slotKey, slotKey))) {
        return "unavailable";
      }

      return "resumed";
    }

    const previous = await inspectExisting();

    if (previous === "resumed") {
      return { admitted: true, status: "resumed" };
    }

    if (previous !== "missing") {
      return reject(previous);
    }

    const minute = Math.floor(deps.context.nowMs / 60000);

    for (let index = 0; index < capacity; index++) {
      const slotKey =
        `slot__${minute}__${String(index).padStart(3, "0")}`;

      const result = await store.createAll([
        makeRow(grantKey, slotKey),
        makeRow(submissionKey, slotKey),
        makeRow(slotKey, slotKey)
      ]);

      if (result === "created") {
        return { admitted: true, status: "reserved" };
      }

      if (result !== "conflict") {
        return reject("unavailable");
      }

      // A competing identical request may already
      // have committed the same reservation.
      const competing = await inspectExisting();

      if (competing === "resumed") {
        return { admitted: true, status: "resumed" };
      }

      if (competing !== "missing") {
        return reject(competing);
      }

      // Advance only when the conflicting capacity
      // slot actually exists.
      const occupied = await store.read(
        partitionKey, slotKey
      );

      if (!occupied ||
          occupied.partitionKey !== partitionKey ||
          occupied.rowKey !== slotKey) {
        return reject("unavailable");
      }
    }

    return reject("capacity_exhausted");

  } catch {
    // An uncertain transaction cannot announce success.
    // A later identical retry may inspect durable rows.
    return reject("unavailable");
  }
}

export type PermanentPublicAdmissionDependencies =
  SharedAdmissionDependencies<PermanentPublicVisitContext>;

function fingerprintPublicRegistration(
  command: PublicVisitCommand,
  date: string,
  secret: string
): string {
  // Preserve identity and family binding, adding all
  // public profile fields under a separate hash domain.
  const profile = command.profile;

  if (!profile ||
      typeof profile.contactConsent !== "boolean") {
    throw new Error("Complete public profile required");
  }

  return createHmac("sha256", secret)
    .update(JSON.stringify([
      "permanent-public-visit-complete-claim-v1",
      fingerprint(command, date, secret),
      profile.visitType,
      profile.churchHome,
      profile.interests,
      profile.invitedBy,
      profile.contactConsent
    ]), "utf8")
    .digest("hex");
}

export async function reservePermanentPublicVisitAdmission(
  input: Readonly<{
    token: unknown;
    command: PublicVisitCommand;
  }>,
  deps: PermanentPublicAdmissionDependencies = {}
): Promise<PermanentQrAdmissionResult> {
  return reservePermanentVisitorAdmissionCore<
    PermanentPublicVisitContext,
    PublicVisitCommand
  >(
    input,
    deps,
    verifyPermanentPublicVisitSession,
    fingerprintPublicRegistration
  );
}
