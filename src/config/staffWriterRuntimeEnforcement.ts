/**
 * Server-side Staff writer transition enforcement configuration.
 *
 * Default: preserve existing legacy compatibility.
 *
 * This reader does not authorize any Staff mutation,
 * initiate coordinated execution, or prove production fencing.
 *
 * Never source this value from HTTP request input.
 */

export type StaffWriterRuntimeEnforcement = Readonly<{
  mode: "legacy" | "migration_hold" | "coordinated" | "invalid";
  allowLegacyWriter: boolean;
  blockInvitationBeforeGraph: boolean;
  coordinatedExecutionPermitted: false;
  authorizationGranted: false;
  productionWriterFenced: false;
}>;

export function classifyStaffWriterRuntimeEnforcement(
  value: unknown,
  siteName?: unknown
): StaffWriterRuntimeEnforcement {
  const mode =
    value === undefined
      ? "legacy"
      : value === "legacy" ||
          value === "migration_hold" ||
          value === "coordinated"
        ? value
        : "invalid";

  // Isolated kiosk cannot inherit the legacy writer default.
  // This is a deny-only guard, not coordinated writer authority.
  const isolatedKiosk =
    siteName === "hope-kiosk-acceptance-api";

  return {
    mode,
    allowLegacyWriter: mode === "legacy" && !isolatedKiosk,
    blockInvitationBeforeGraph: mode !== "legacy" || isolatedKiosk,
    coordinatedExecutionPermitted: false,
    authorizationGranted: false,
    productionWriterFenced: false
  };
}

export function readStaffWriterRuntimeEnforcement():
  StaffWriterRuntimeEnforcement {
  return classifyStaffWriterRuntimeEnforcement(
    process.env.HOPE_STAFF_WRITER_TRANSITION_MODE,
    process.env.WEBSITE_SITE_NAME
  );
}
