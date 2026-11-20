import { pathToFileURL } from "node:url";

// Temporary Friends & Family kiosk, November 22, 2026.
//
// This is a fail-closed non-HTTP runner boundary,
// NOT an authorized connectivity execution mechanism.
//
// No application runtime registration, network imports,
// managed-identity access, or visitor-data operations.
//
// Caller arguments, environment variables, and claimed
// approvals cannot enable execution.

export async function runPrivateConnectivityRunner() {
  return Object.freeze({
    status: "AUTHORIZATION_UNAVAILABLE"
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // Fixed status only. No credentials or configuration output.
  process.stdout.write("AUTHORIZATION_UNAVAILABLE\n");
  process.exitCode = 78;
}