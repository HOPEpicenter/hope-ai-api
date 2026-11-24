import type { TableClient } from "@azure/data-tables";
import { isVisitorCheckInRequest } from "./recordVisitorCheckIn";

export type PermanentVisitRecoveryIntent = Readonly<{
  submissionId: string;
  serviceId: string;
  visitDate: string;
  familyExpected: boolean;
  followupExpected: boolean;
}>;

type JournalRow = PermanentVisitRecoveryIntent & {
  partitionKey: string;
  rowKey: string;
  version: number;
  recordedAt: string;
};

export type PermanentVisitRecoveryState =
  | { status: "not_tracked" | "unavailable" }
  | { status: "pending" | "completed"; intent: PermanentVisitRecoveryIntent };

export type PermanentVisitRecoveryJournal = {
  inspect(submissionId: string): Promise<PermanentVisitRecoveryState>;
  begin(intent: PermanentVisitRecoveryIntent): Promise<boolean>;
  complete(intent: PermanentVisitRecoveryIntent): Promise<boolean>;
};

const INTENT = "PUBLIC_VISIT_RECOVERY_INTENT";
const COMPLETE = "PUBLIC_VISIT_RECOVERY_COMPLETE";

function iso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function validIntent(value: PermanentVisitRecoveryIntent): boolean {
  return isVisitorCheckInRequest(value.submissionId, value.serviceId) &&
    typeof value.visitDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.visitDate) &&
    iso(value.visitDate + "T00:00:00.000Z") &&
    typeof value.familyExpected === "boolean" &&
    typeof value.followupExpected === "boolean";
}

function minimal(value: PermanentVisitRecoveryIntent): PermanentVisitRecoveryIntent {
  return {
    submissionId: value.submissionId, serviceId: value.serviceId,
    visitDate: value.visitDate, familyExpected: value.familyExpected,
    followupExpected: value.followupExpected
  };
}

function same(left: PermanentVisitRecoveryIntent, right: PermanentVisitRecoveryIntent): boolean {
  return JSON.stringify(minimal(left)) === JSON.stringify(minimal(right));
}

/** Internal, create-only evidence of pipeline progress, not admission or identity authority.
 * No recovery action is authorized by these rows alone. No public reader is supplied.
 * The trusted pipeline calls begin after admission and complete after all required writes.
 */
export function createPermanentVisitRecoveryJournal(
  table: Pick<TableClient, "listEntities" | "createEntity">
): PermanentVisitRecoveryJournal {
  async function read(partition: string, submissionId: string): Promise<JournalRow | null> {
    let found: JournalRow | null = null;
    const filter = `PartitionKey eq '${partition}' and RowKey eq '${submissionId}'`;
    for await (const row of table.listEntities<JournalRow>({ queryOptions: { filter } })) {
      if (found || row.partitionKey !== partition || row.rowKey !== submissionId ||
          row.submissionId !== submissionId || row.version !== 1 ||
          !iso(row.recordedAt) || !validIntent(row)) {
        throw new Error("Invalid recovery journal evidence");
      }
      found = row;
    }
    return found;
  }

  async function inspect(submissionId: string): Promise<PermanentVisitRecoveryState> {
    try {
      if (!isVisitorCheckInRequest(submissionId, "recovery")) return { status: "unavailable" };
      const intent = await read(INTENT, submissionId);
      const complete = await read(COMPLETE, submissionId);
      if (!intent) return { status: complete ? "unavailable" : "not_tracked" };
      if (complete && !same(intent, complete)) return { status: "unavailable" };
      return { status: complete ? "completed" : "pending", intent: minimal(intent) };
    } catch { return { status: "unavailable" }; }
  }

  async function create(partition: string, intent: PermanentVisitRecoveryIntent): Promise<boolean> {
    const row: JournalRow = {
      ...minimal(intent), partitionKey: partition, rowKey: intent.submissionId,
      version: 1, recordedAt: new Date().toISOString()
    };
    try { await table.createEntity(row); }
    catch { /* Reconcile only an exact persisted row after an uncertain write. */ }
    const stored = await read(partition, intent.submissionId);
    return stored !== null && same(stored, intent);
  }

  return {
    inspect,
    async begin(intent) {
      try {
        if (!validIntent(intent)) return false;
        const existing = await inspect(intent.submissionId);
        if (existing.status === "pending" || existing.status === "completed") return same(existing.intent, intent);
        if (existing.status !== "not_tracked") return false;
        return await create(INTENT, intent);
      } catch { return false; }
    },
    async complete(intent) {
      try {
        if (!validIntent(intent)) return false;
        const existing = await inspect(intent.submissionId);
        if (existing.status !== "pending" && existing.status !== "completed") return false;
        if (!same(existing.intent, intent)) return false;
        return existing.status === "completed" || await create(COMPLETE, intent);
      } catch { return false; }
    }
  };
}
