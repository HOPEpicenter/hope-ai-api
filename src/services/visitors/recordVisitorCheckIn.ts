import type { TableClient } from "@azure/data-tables";
import { getTableClient } from "../../functions/_shared/tableClient";
import { getVisitorById } from "../../functions/_shared/visitorsRepository";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

const CHECK_IN_PARTITION = "VISITOR_CHECK_IN";
const SUBMISSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type CheckInCommand = {
  submissionId: string;
  visitorId: string;
  serviceId: string;
};

type CheckInReceipt = CheckInCommand & { recordedAt: string };

type CheckInEntity = Omit<CheckInReceipt, "submissionId"> & {
  partitionKey: string;
  rowKey: string;
};

type Dependencies = {
  table?: Pick<TableClient, "createEntity" | "getEntity" | "createTable">;
  readVisitor?: typeof getVisitorById;
  now?: () => Date;
};

export type CheckInResult =
  | { status: "recorded"; receipt: CheckInReceipt }
  | { status: "invalid" | "visitor_not_found" | "submission_conflict" };

function readReceipt(row: CheckInEntity, command: CheckInCommand): CheckInResult {
  if (
    row.partitionKey !== CHECK_IN_PARTITION || row.rowKey !== command.submissionId ||
    typeof row.recordedAt !== "string" || !Number.isFinite(Date.parse(row.recordedAt))
  ) {
    throw new Error("Invalid stored visitor check-in.");
  }
  if (row.visitorId !== command.visitorId || row.serviceId !== command.serviceId) {
    return { status: "submission_conflict" };
  }
  return {
    status: "recorded",
    receipt: {
      submissionId: row.rowKey,
      visitorId: row.visitorId,
      serviceId: row.serviceId,
      recordedAt: row.recordedAt
    }
  };
}

async function readCheckIn(
  table: Pick<TableClient, "getEntity">,
  submissionId: string
): Promise<CheckInEntity | null> {
  try {
    return await table.getEntity<CheckInEntity>(CHECK_IN_PARTITION, submissionId);
  } catch (error) {
    if ((error as { statusCode?: number } | null)?.statusCode === 404) return null;
    throw error;
  }
}

/** Internal command. The caller must resolve visitor and service IDs server-side. */
export async function recordVisitorCheckIn(
  command: CheckInCommand,
  dependencies: Dependencies = {}
): Promise<CheckInResult> {
  if (
    typeof command.submissionId !== "string" || !SUBMISSION_ID.test(command.submissionId) ||
    typeof command.visitorId !== "string" || !STORAGE_ID.test(command.visitorId) ||
    typeof command.serviceId !== "string" || !STORAGE_ID.test(command.serviceId)
  ) {
    return { status: "invalid" };
  }

  const table = dependencies.table ?? getTableClient("Visitors");
  await ensureTableExists(table);
  const previous = await readCheckIn(table, command.submissionId);
  if (previous) return readReceipt(previous, command);

  const visitor = await (dependencies.readVisitor ?? getVisitorById)(command.visitorId);
  if (!visitor || visitor.visitorId !== command.visitorId) {
    return { status: "visitor_not_found" };
  }

  // The visit row is also the receipt. A conditional insert commits both.
  const row: CheckInEntity = {
    partitionKey: CHECK_IN_PARTITION,
    rowKey: command.submissionId,
    visitorId: visitor.visitorId,
    serviceId: command.serviceId,
    recordedAt: (dependencies.now ?? (() => new Date()))().toISOString()
  };
  try {
    await table.createEntity(row);
  } catch (error) {
    // A competing request or a lost acknowledgement may have saved this row.
    const committed = await readCheckIn(table, command.submissionId);
    if (committed) return readReceipt(committed, command);
    throw error;
  }
  return readReceipt(row, command);
}
