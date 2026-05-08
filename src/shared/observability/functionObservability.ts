import { randomUUID } from "crypto";

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

export function logFunctionError(
  context: any,
  operation: string,
  err: any,
  fields: Record<string, unknown> = {}
): void {
  const message = String(err?.message ?? err ?? "Unknown error");

  const payload = {
    level: "error",
    operation,
    message,
    ...fields
  };

  if (context?.log?.error) {
    context.log.error(JSON.stringify(payload));
    return;
  }

  console.error(JSON.stringify(payload));
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
