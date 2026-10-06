import assert from "node:assert/strict";
import {
  parseMinistryEmailProvider,
  readMinistryEmailProviderSelection
} from "../../src/config/ministryEmailProviderSelection";

assert.equal(
  parseMinistryEmailProvider("resend"),
  "resend"
);
assert.equal(
  parseMinistryEmailProvider("sendgrid"),
  "sendgrid"
);
assert.equal(
  parseMinistryEmailProvider("ses"),
  "ses"
);

assert.equal(
  parseMinistryEmailProvider(" RESEND "),
  "resend"
);
assert.equal(
  parseMinistryEmailProvider("SendGrid"),
  "sendgrid"
);

assert.equal(
  parseMinistryEmailProvider(""),
  null
);
assert.equal(
  parseMinistryEmailProvider("mailgun"),
  null
);
assert.equal(
  parseMinistryEmailProvider(undefined),
  null
);

const previous =
  process.env.MINISTRY_EMAIL_PROVIDER;

try {
  delete process.env.MINISTRY_EMAIL_PROVIDER;
  assert.equal(
    readMinistryEmailProviderSelection(),
    null
  );

  process.env.MINISTRY_EMAIL_PROVIDER = "resend";
  assert.equal(
    readMinistryEmailProviderSelection(),
    "resend"
  );

  process.env.MINISTRY_EMAIL_PROVIDER = "invalid";
  assert.equal(
    readMinistryEmailProviderSelection(),
    null
  );
}
finally {
  if (previous === undefined) {
    delete process.env.MINISTRY_EMAIL_PROVIDER;
  }
  else {
    process.env.MINISTRY_EMAIL_PROVIDER =
      previous;
  }
}

console.log(
  "ministryEmailProviderSelection.test.ts passed"
);
