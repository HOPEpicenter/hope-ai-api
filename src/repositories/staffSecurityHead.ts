import { STAFF_SECURITY_METADATA_HEAD } from "./staffEventsRepository";

export type StaffSecurityAuthorizationState =
  | "active"
  | "pending"
  | "revoked";

export type StaffSecurityHead = Readonly<{
  partitionKey: string;
  rowKey: typeof STAFF_SECURITY_METADATA_HEAD;
  revision: number;
  authorizationRevision: number;
  state: StaffSecurityAuthorizationState;
  etag: string;
}>;

function object(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < Number.MAX_SAFE_INTEGER - 1;
}

function validEtag(value: unknown): value is string {
  return typeof value === "string" &&
    /^(?:W\/)?"[^"\r\n]+"$/.test(value);
}

export function readStaffSecurityHead(
  value: unknown,
  expectedStaffId: string
): StaffSecurityHead | null {
  const head = object(value);
  if (!head ||
      head.partitionKey !== expectedStaffId ||
      head.rowKey !== STAFF_SECURITY_METADATA_HEAD ||
      !validRevision(head.revision) ||
      head.authorizationRevision !== head.revision ||
      (head.state !== "active" &&
       head.state !== "pending" &&
       head.state !== "revoked") ||
      !validEtag(head.etag)) {
    return null;
  }

  return head as StaffSecurityHead;
}
