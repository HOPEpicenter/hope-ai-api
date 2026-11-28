import { requireApiKeyForFunction } from "../_shared/apiKey";
import { getTableClient } from "../_shared/tableClient";
import { readCanonicalStaffDirectory } from "../../services/staff/readCanonicalStaffDirectory";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

const STAFF_STORAGE_PROBE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

async function probeIsolatedStaffStorage(context: any): Promise<void> {
  if (
    process.env.WEBSITE_SITE_NAME !== "hope-kiosk-acceptance-api" ||
    process.env.HOPE_TABLE_AUTH_MODE?.trim() !== "managed-identity" ||
    process.env.HOPE_TABLE_ENDPOINT?.trim().replace(/\/$/, "") !==
      "https://sthopekiad20261122.table.core.windows.net"
  ) {
    context.res = {
      status: 404,
      headers: STAFF_STORAGE_PROBE_HEADERS,
      body: { code: "STAFF_STORAGE_PROBE_UNAVAILABLE" }
    };
    return;
  }

  try {
    // This client does not create the table. Query one synthetic partition
    // and discard the result so the diagnostic returns no Staff records.
    const table = getTableClient("StaffEvents");
    await table.listEntities({
      queryOptions: {
        filter: "PartitionKey eq '__staff_recovery_probe__'",
        select: ["PartitionKey"]
      }
    }).byPage({ maxPageSize: 1 }).next();

    context.res = {
      status: 200,
      headers: STAFF_STORAGE_PROBE_HEADERS,
      body: { code: "STAFF_STORAGE_READ_ALLOWED" }
    };
  } catch (error: unknown) {
    const storageError = error as {
      statusCode?: unknown;
      code?: unknown;
      response?: {
        status?: unknown;
        headers?: { get?: (name: string) => unknown };
      };
    } | null;
    const statusCode = storageError?.statusCode;
    const responseStatus = storageError?.response?.status;
    const code = storageError?.code;
    const headers = storageError?.response?.headers;
    const headerCode = typeof headers?.get === "function"
      ? headers.get("x-ms-error-code")
      : undefined;
    const mismatch = "AuthorizationPermissionMismatch";
    if (
      (statusCode !== 403 && responseStatus !== 403) ||
      (statusCode !== undefined && statusCode !== 403) ||
      (responseStatus !== undefined && responseStatus !== 403) ||
      (code !== mismatch && headerCode !== mismatch) ||
      (code !== undefined && code !== mismatch) ||
      (headerCode !== undefined && headerCode !== mismatch)
    ) {
      const safeStatus = (status: unknown): number | string =>
        typeof status === "number" &&
        [400, 401, 403, 404, 408, 429, 500, 502, 503, 504].includes(status)
          ? status
          : status === undefined ? "unavailable" : "other";
      context.log.warn(JSON.stringify({
        operation: "staffStorageProbe",
        statusCode: safeStatus(statusCode),
        responseStatus: safeStatus(responseStatus)
      }));
      throw error;
    }

    context.res = {
      status: 503,
      headers: STAFF_STORAGE_PROBE_HEADERS,
      body: { code: "STAFF_STORAGE_PERMISSION_DENIED" }
    };
  }
}

export async function getStaffIdentities(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);

    if (!auth.ok) {
      context.log.warn("getStaffIdentities auth rejected");

      context.res = {
        status: auth.status,
        headers: {
          "content-type": "application/json; charset=utf-8"
        },
        body: {
          ...auth.body,
          authRejectedBy: "getStaffIdentities"
        }
      };

      return;
    }

    if (req?.query?.staffStorageProbe === "true") {
      await probeIsolatedStaffStorage(context);
      return;
    }

    const items = await readCanonicalStaffDirectory();

    context.res = {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: {
        ok: true,
        requestId,
        count: items.length,
        items
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getStaffIdentities", err, {
      requestId
    });

    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: apiErrorBody(
        "GET_STAFF_IDENTITIES_FAILED",
        "Unexpected staff identities error",
        requestId
      )
    };
  }
}
