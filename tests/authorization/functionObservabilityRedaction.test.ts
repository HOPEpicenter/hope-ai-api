import {
  logFunctionError
} from "../../src/shared/observability/functionObservability";

import {
  getRequestId
} from "../../src/shared/observability/functionObservability";

const markers = [
  "Synthetic Staff Name",
  "synthetic.staff@example.invalid",
  "SYNTHETIC_SECRET_MARKER"
];

let failures = 0;

function check(name: string, passed: boolean): void {
  if (passed) {
    console.log(`[PASS] ${name}`);
  } else {
    console.log(`[FAIL] ${name}`);
    failures++;
  }
}

function capture(
  error: unknown,
  fields: Record<string, unknown>
): string[] {
  const output: string[] = [];

  const context = {
    log: {
      error(value: unknown) {
        output.push(String(value));
      }
    }
  };

  logFunctionError(
    context,
    "syntheticStaffInvitationDiagnostic",
    error,
    fields
  );

  return output;
}

function excludesMarkers(output: string[]): boolean {
  const value = output.join("\n");
  return markers.every(marker => !value.includes(marker));
}

// Test 1: Raw exception text must not leak.

const exceptionOutput = capture(
  new Error(`Synthetic failure: ${markers.join(" | ")}`),
  { requestId: "synthetic-request-001" }
);

check(
  "Exception content excluded",
  exceptionOutput.length === 1 &&
  excludesMarkers(exceptionOutput)
);

// Test 2: Caller metadata must not bypass protection.

const metadataOutput = capture(
  new Error("Synthetic failure"),
  {
    requestId: markers[1],
    displayName: markers[0],
    secret: markers[2]
  }
);

check(
  "Untrusted metadata excluded",
  metadataOutput.length === 1 &&
  excludesMarkers(metadataOutput)
);

// Test 3: Exception getters must not execute.

let getterExecuted = false;

const hostileError: Record<string, unknown> = {};

Object.defineProperty(hostileError, "message", {
  enumerable: true,
  get() {
    getterExecuted = true;
    return markers[2];
  }
});

try {
  const hostileOutput = capture(
    hostileError,
    { requestId: "synthetic-request-002" }
  );

  check(
    "Hostile exception getter not executed",
    !getterExecuted &&
    hostileOutput.length === 1 &&
    excludesMarkers(hostileOutput)
  );
} catch {
  check("Hostile exception handled safely", false);
}

// Test 4: Preserve useful non-sensitive context.

const normalOutput = capture(
  new Error("Synthetic failure"),
  { requestId: "123e4567-e89b-42d3-a456-426614174000" }
);

let validContext = false;

try {
  const parsed = JSON.parse(normalOutput[0]);

  validContext =
    parsed.level === "error" &&
    parsed.operation === "syntheticStaffInvitationDiagnostic" &&
    parsed.requestId === "123e4567-e89b-42d3-a456-426614174000";
} catch {
  validContext = false;
}

check("Safe operational context preserved", validContext);

// Test 5: Caller-controlled request identifiers are untrusted.

const unsafeRequestId = getRequestId({
  headers: {
    "x-request-id": markers[2]
  }
});

const requestIdOutput = capture(
  new Error("Synthetic failure"),
  { requestId: unsafeRequestId }
);

check(
  "Untrusted correlation value excluded",
  excludesMarkers(requestIdOutput)
);

console.log("");
console.log("=== C4 SYNTHETIC REGRESSION SUMMARY ===");

if (failures > 0) {
  console.log(`[EXPECTED BASELINE FAILURE] ${failures} checks failed.`);
  console.log("[SAFE] No marker values printed.");
  process.exitCode = 1;
} else {
  console.log("[PASS] All C4 synthetic regression checks.");
}
