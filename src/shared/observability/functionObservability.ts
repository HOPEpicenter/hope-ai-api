import { randomUUID } from "crypto";
import { types } from "node:util";

export function getRequestId(req: any): string {
  const headerValue =
    req?.headers?.["x-request-id"] ??
    req?.headers?.["X-Request-Id"] ??
    req?.headers?.["x-correlation-id"] ??
    req?.headers?.["X-Correlation-Id"];

  const fromHeader = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  const normalized = String(fromHeader ?? "").trim();

  return normalized || randomUUID();
}

const SAFE_OPERATION = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const SAFE_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readSafeRequestId(fields: unknown): string | undefined {
  try {
    if (
      fields === null ||
      typeof fields !== "object" ||
      types.isProxy(fields)
    ) {
      return undefined;
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      fields,
      "requestId"
    );

    const value =
      descriptor && "value" in descriptor
        ? descriptor.value
        : undefined;

    return typeof value === "string" &&
      SAFE_REQUEST_ID.test(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function logFunctionError(
  context: any,
  operation: string,
  err: any,
  fields: Record<string, unknown> = {}
): void {
  // Deliberately do not inspect or serialize err.
  // Arbitrary metadata is not trusted diagnostic content.
  const requestId = readSafeRequestId(fields);

  const payload = {
    level: "error",
    operation:
      typeof operation === "string" &&
      SAFE_OPERATION.test(operation)
        ? operation
        : "unknown",
    message: "Operation failed",
    ...(requestId ? { requestId } : {})
  };

  if (context?.log?.error) {
    context.log.error(JSON.stringify(payload));
    return;
  }

  console.error(JSON.stringify(payload));
}

export function logFunctionInfo(
  context: any,
  operation: string,
  fields: Record<string, unknown> = {}
): void {
  const payload = {
    level: "info",
    operation,
    ...fields
  };

  const serialized = JSON.stringify(payload);

  if (context?.log?.info) {
    context.log.info(serialized);
    return;
  }

  if (typeof context?.log === "function") {
    context.log(serialized);
  }
}

export function apiErrorBody(
  code: string,
  message: string,
  requestId: string
): { ok: false; error: { code: string; message: string; requestId: string } } {
  return {
    ok: false,
    error: {
      code,
      message,
      requestId
    }
  };
}
