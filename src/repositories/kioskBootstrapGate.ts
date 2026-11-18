/**
 * Disabled one-time bootstrap gate.
 *
 * This is not Staff authorization, Staff creation, or
 * an Entra binding reservation.
 *
 * The caller must supply a trusted, isolated Table client.
 * No automatic retries or releases are implemented.
 */
export interface BootstrapGatePort {
  createEntity(entity: {
    partitionKey: string;
    rowKey: string;
    operationId: string;
  }): Promise<unknown>;
}

export type BootstrapGateResult = Readonly<{
  status: "disabled" | "invalid" | "reserved" |
    "conflict" | "uncertain";
  authorizationGranted: false;
  staffCreationPermitted: false;
  retryPermitted: false;
}>;

const PARTITION = "kiosk-first-admin-bootstrap-v1";
const ROW = "singleton";

function result(status: BootstrapGateResult["status"]):
  BootstrapGateResult {
  return {
    status,
    authorizationGranted: false,
    staffCreationPermitted: false,
    retryPermitted: false
  };
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { statusCode?: unknown }).statusCode;
  return status === 409 || status === 412;
}

export async function reserveKioskBootstrapGate(
  port: BootstrapGatePort | null | undefined,
  operationId: unknown,
  enabled = false
): Promise<BootstrapGateResult> {
  if (enabled !== true) return result("disabled");

  if (
    !port ||
    typeof port.createEntity !== "function" ||
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(operationId)
  ) {
    return result("invalid");
  }

  try {
    await port.createEntity({
      partitionKey: PARTITION,
      rowKey: ROW,
      operationId: operationId.toLowerCase()
    });
    return result("reserved");
  } catch (error) {
    return result(isConflict(error) ? "conflict" : "uncertain");
  }
}
