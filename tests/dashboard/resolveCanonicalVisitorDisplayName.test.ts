import assert from "node:assert/strict";
import {
  resolveCanonicalVisitorDisplayName
} from "../../src/services/dashboard/readCanonicalVisitorDashboardCard";

function main(): void {
  const visitorId = "visitor-display-name-regression";

  assert.equal(
    resolveCanonicalVisitorDisplayName(
      visitorId,
      { name: "Pilot Person" }
    ),
    "Pilot Person",
    "dashboard cards should expose the current canonical visitor name"
  );

  assert.equal(
    resolveCanonicalVisitorDisplayName(
      visitorId,
      { name: "Pilot Person Updated" }
    ),
    "Pilot Person Updated",
    "dashboard cards should reflect visitor identity edits"
  );

  assert.equal(
    resolveCanonicalVisitorDisplayName(
      visitorId,
      {
        displayName: "Preferred Display Name",
        name: "Fallback Name"
      }
    ),
    "Preferred Display Name",
    "an explicit canonical display name should take precedence"
  );

  assert.equal(
    resolveCanonicalVisitorDisplayName(visitorId, null),
    null,
    "missing visitor identity should remain explicit"
  );

  console.log(
    "resolveCanonicalVisitorDisplayName.test.ts passed"
  );
}

main();
