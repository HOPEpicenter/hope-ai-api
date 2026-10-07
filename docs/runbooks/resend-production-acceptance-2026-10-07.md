# First production Resend acceptance — 2026-10-07

## Result

The first controlled production ministry-email acceptance completed
successfully against backend main
`4579990f2e319bf1b473d9c0bb6b525d01330899`.

Approved fixture identifiers:

- delivery: `prod-resend-delivery-cafe7a1b6a9642a08ee7ef46f52ac818`
- dispatch request: `prod-first-send-59137c73e15347d2a9da86f735251dec`

No recipient address, credential, staff identifier, webhook secret, or provider
message ID is recorded here.

## Evidence

Before dispatch, production verified:

- Phase 5 disabled;
- provider sending disabled;
- dispatch recovery disabled or absent;
- exact-address recipient allowlist in force;
- synthetic visitor matched the sole approved recipient;
- active Six-Week plan with contact consent;
- granted email preference;
- eligible, uncancelled Six-Week email intent;
- delivery state `requested` with no dispatch claim or provider execution;
- Resend sender configuration and signed webhook boundary available.

After explicit activation, sustained live convergence was established before
one dispatch request was made.

The dispatch completed with:

- HTTP 200;
- status `provider_accepted`;
- no reconciliation requirement;
- one durable dispatch attempt.

Signed Resend webhook evidence was persisted for the exact delivery and
dispatch attempt. Observed event types were `email.sent` and
`email.delivered`.

Provider acceptance and recipient delivery remain separate concepts; future
operations must continue to require correlated provider evidence before
claiming recipient delivery.

## Workflow isolation

The send did not mutate ministry workflow state:

- no `MinistryCommunicationOutcome` was created;
- ministry communication events were unchanged;
- Six-Week follow-up events were unchanged.

Provider activity alone must not complete Six-Week work or create ministry
communication outcomes.

## Rollback

Immediately after the single dispatch, production returned to fail-closed
state:

- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false`;
- `FEATURE_PHASE5_COMMUNICATIONS=false`;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`;
- recipient allowlist cleared;
- dispatch recovery remained disabled or absent.

The delivery, claim, and provider evidence were preserved.

## Flex Consumption convergence rule

During preparation and activation, live requests temporarily reached workers
with different app-setting generations after ARM had retained the new value.

A single successful probe is therefore not sufficient proof of convergence.

Controlled send windows must:

1. verify the intended ARM setting;
2. probe the live data plane repeatedly;
3. reset the success streak when an old worker is observed;
4. require sustained consecutive success before a write or dispatch;
5. use the same sustained proof after rollback.

The first-production send required twenty consecutive Phase-5-enabled reads
before dispatch.

## Limited rollout safeguards

This acceptance does not authorize unrestricted production sending.

Until a later explicit rollout decision:

- use exact-address allowlists only during approved send windows;
- return to `deny_all` after the window unless a continuing allowlist is
  separately approved;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=all` remains unauthorized;
- keep dispatch recovery disabled unless separately approved;
- revalidate consent, preference, intent, recipient policy, and delivery state
  immediately before dispatch;
- dispatch only the exact approved delivery;
- never automatically retry after a durable claim, ambiguous provider
  execution, transport ambiguity, or a `dispatching` state;
- use canonical inspection and evidence-backed reconciliation for uncertainty;
- preserve delivery records, claims, and provider evidence;
- keep provider acceptance separate from recipient-delivery evidence;
- verify provider activity does not mutate ministry workflow state.

Routine ministry-email operations require a separate limited-pilot policy and
explicit rollout approval.
