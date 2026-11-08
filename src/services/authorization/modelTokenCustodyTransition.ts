/**
 * HOPE Ministry OS token custody state-transition model.
 *
 * Metadata-only. No credentials, persistence, network requests,
 * token refresh, or authentication activation.
 *
 * A future authoritative storage adapter must implement atomic
 * compare-and-swap commits and verify trusted actor/session
 * bindings before using transition results.
 */

export type TokenCustodyState = "active" | "revoked" | "uncertain";

export type TokenCustodySnapshot = Readonly<{
  recordId: string;
  revision: number;
  rotationRevision: number;
  revocationRevision: number;
  state: TokenCustodyState;
  accessExpiresAtMs: number;
}>;

export type TokenCustodyCommand = Readonly<{
  action: "rotate" | "revoke";
  expectedRevision: number;
  expectedRotationRevision: number;
  expectedRevocationRevision: number;
  authorized: boolean;
  executionEnabled: boolean;
  nextAccessExpiresAtMs?: number;
}>;

export type TokenCustodyTransitionResult =
  | Readonly<{
      outcome: "denied";
      reason:
        | "execution_disabled"
        | "unauthorized"
        | "invalid_snapshot"
        | "invalid_command"
        | "stale_revision"
        | "custody_not_active";
      executionPermitted: false;
    }>
  | Readonly<{
      outcome: "proposed";
      next: TokenCustodySnapshot;
      executionPermitted: false;
    }>;

function denied(
  reason: Extract<TokenCustodyTransitionResult, { outcome: "denied" }>["reason"],
): TokenCustodyTransitionResult {
  return { outcome: "denied", reason, executionPermitted: false };
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) &&
    (value as number) >= 0;
}

const CUSTODY_METADATA_KEYS = new Set([
  "recordId",
  "revision",
  "rotationRevision",
  "revocationRevision",
  "state",
  "accessExpiresAtMs",
]);

function validSnapshot(value: TokenCustodySnapshot): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    !Object.keys(value).every((key) => CUSTODY_METADATA_KEYS.has(key)) ||
    Object.keys(value).length !== CUSTODY_METADATA_KEYS.size
  ) {
    return false;
  }

  return (
    typeof value.recordId === "string" &&
    value.recordId.trim().length > 0 &&
    validRevision(value.revision) &&
    validRevision(value.rotationRevision) &&
    validRevision(value.revocationRevision) &&
    value.rotationRevision <= value.revision &&
    value.revocationRevision <= value.revision &&
    (value.state === "active" ||
      value.state === "revoked" ||
      value.state === "uncertain") &&
    Number.isSafeInteger(value.accessExpiresAtMs) &&
    value.accessExpiresAtMs > 0
  );
}

export function modelTokenCustodyTransition(
  snapshot: TokenCustodySnapshot,
  command: TokenCustodyCommand,
): TokenCustodyTransitionResult {
  // A proposed transition is never authorization to execute.
  if (command?.executionEnabled !== true) {
    return denied("execution_disabled");
  }

  if (command.authorized !== true) {
    return denied("unauthorized");
  }

  if (!snapshot || !validSnapshot(snapshot)) {
    return denied("invalid_snapshot");
  }

  if (
    (command.action !== "rotate" && command.action !== "revoke") ||
    !validRevision(command.expectedRevision) ||
    !validRevision(command.expectedRotationRevision) ||
    !validRevision(command.expectedRevocationRevision)
  ) {
    return denied("invalid_command");
  }

  if (
    snapshot.revision !== command.expectedRevision ||
    snapshot.rotationRevision !== command.expectedRotationRevision ||
    snapshot.revocationRevision !== command.expectedRevocationRevision
  ) {
    return denied("stale_revision");
  }

  if (snapshot.state !== "active") {
    return denied("custody_not_active");
  }

  if (snapshot.revision >= Number.MAX_SAFE_INTEGER) {
    return denied("invalid_snapshot");
  }

  if (command.action === "rotate") {
    if (
      !Number.isSafeInteger(command.nextAccessExpiresAtMs) ||
      command.nextAccessExpiresAtMs! <= snapshot.accessExpiresAtMs
    ) {
      return denied("invalid_command");
    }

    if (snapshot.rotationRevision >= Number.MAX_SAFE_INTEGER) {
      return denied("invalid_snapshot");
    }

    return {
      outcome: "proposed",
      next: {
        ...snapshot,
        revision: snapshot.revision + 1,
        rotationRevision: snapshot.rotationRevision + 1,
        accessExpiresAtMs: command.nextAccessExpiresAtMs!,
      },
      executionPermitted: false,
    };
  }

  if (snapshot.revocationRevision >= Number.MAX_SAFE_INTEGER) {
    return denied("invalid_snapshot");
  }

  return {
    outcome: "proposed",
    next: {
      ...snapshot,
      revision: snapshot.revision + 1,
      revocationRevision: snapshot.revocationRevision + 1,
      state: "revoked",
    },
    executionPermitted: false,
  };
}