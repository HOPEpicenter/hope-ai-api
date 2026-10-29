export const FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY = false;

export class FormationEventReadOnlyCredentialBoundaryUnavailableError extends Error {
  constructor() {
    super("A dedicated read-only FormationEvent storage credential is not configured");
    this.name = "FormationEventReadOnlyCredentialBoundaryUnavailableError";
  }
}

/**
 * The isolated credential implementation is intentionally unavailable until a
 * dedicated data-reader identity and its Azure Table permissions are approved.
 * This boundary never falls back to a shared connection string or constructs a client.
 */
export function createFormationEventReadOnlyCredentialBoundary(): never {
  throw new FormationEventReadOnlyCredentialBoundaryUnavailableError();
}
