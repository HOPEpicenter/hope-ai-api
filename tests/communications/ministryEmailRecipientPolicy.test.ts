import assert from "node:assert/strict";
import {
  isMinistryEmailRecipientAllowed,
  readMinistryEmailRecipientPolicy
} from "../../src/config/ministryEmailRecipientPolicy";

function run(): void {
  const originalPolicy =
    process.env.MINISTRY_EMAIL_RECIPIENT_POLICY;
  const originalAllowed =
    process.env.MINISTRY_EMAIL_ALLOWED_RECIPIENTS;

  try {
    delete process.env.MINISTRY_EMAIL_RECIPIENT_POLICY;
    delete process.env.MINISTRY_EMAIL_ALLOWED_RECIPIENTS;

    let config =
      readMinistryEmailRecipientPolicy();

    assert.equal(config.policy, "deny_all");
    assert.equal(
      isMinistryEmailRecipientAllowed(
        "allowed@example.org",
        config
      ),
      false
    );

    process.env.MINISTRY_EMAIL_RECIPIENT_POLICY =
      "unexpected";

    config =
      readMinistryEmailRecipientPolicy();

    assert.equal(config.policy, "deny_all");

    process.env.MINISTRY_EMAIL_RECIPIENT_POLICY =
      "ALLOWLIST";

    process.env.MINISTRY_EMAIL_ALLOWED_RECIPIENTS =
      " First@Example.org,second@example.net,*@example.org,@example.org ";

    config =
      readMinistryEmailRecipientPolicy();

    assert.equal(config.policy, "allowlist");
    assert.equal(config.allowedRecipients.size, 2);

    assert.equal(
      isMinistryEmailRecipientAllowed(
        " FIRST@example.org ",
        config
      ),
      true
    );

    assert.equal(
      isMinistryEmailRecipientAllowed(
        "second@example.net",
        config
      ),
      true
    );

    assert.equal(
      isMinistryEmailRecipientAllowed(
        "other@example.org",
        config
      ),
      false
    );

    assert.equal(
      isMinistryEmailRecipientAllowed(
        "*@example.org",
        config
      ),
      false
    );

    process.env.MINISTRY_EMAIL_RECIPIENT_POLICY =
      "all";

    config =
      readMinistryEmailRecipientPolicy();

    assert.equal(
      isMinistryEmailRecipientAllowed(
        "any-valid@example.org",
        config
      ),
      true
    );

    assert.equal(
      isMinistryEmailRecipientAllowed(
        "not-an-email",
        config
      ),
      false
    );
  } finally {
    if (originalPolicy === undefined) {
      delete process.env.MINISTRY_EMAIL_RECIPIENT_POLICY;
    } else {
      process.env.MINISTRY_EMAIL_RECIPIENT_POLICY =
        originalPolicy;
    }

    if (originalAllowed === undefined) {
      delete process.env.MINISTRY_EMAIL_ALLOWED_RECIPIENTS;
    } else {
      process.env.MINISTRY_EMAIL_ALLOWED_RECIPIENTS =
        originalAllowed;
    }
  }

  console.log(
    "ministryEmailRecipientPolicy.test.ts passed"
  );
}

run();
