# Ministry email limited production pilot

## Purpose

This runbook defines the limited production pilot that follows the successful
first controlled Resend production acceptance completed on 2026-10-07.

The pilot is intentionally narrower than routine ministry-email operations.
It validates that real production sending can remain safe, observable,
consent-backed, evidence-backed, and operationally reversible before any wider
rollout is considered.

The backend remains authoritative throughout the pilot.

## Pilot objectives

The pilot must prove that a small number of explicitly approved production
emails can be sent while preserving all existing ministry workflow semantics.

The pilot is successful only if it demonstrates:

- exact-recipient authorization;
- current contact consent and communication preference;
- deterministic, inspectable delivery state;
- one durable dispatch claim per delivery;
- provider acceptance tracked separately from recipient delivery;
- signed provider evidence correlated to the exact delivery and dispatch
  attempt;
- no automatic retry after ambiguous or claimed execution;
- no unintended MinistryCommunicationOutcome mutation;
- no unintended Six-Week workflow mutation;
- reliable fail-closed rollback after every activation window.

## Scope

The initial limited pilot permits:

- Resend as the configured provider;
- exact-address recipient allowlists only;
- no more than five approved recipient addresses in any one activation window;
- one delivery dispatched at a time;
- explicitly approved ministry communications that satisfy all canonical
  eligibility checks.

The initial pilot does not permit:

- `MINISTRY_EMAIL_RECIPIENT_POLICY=all`;
- wildcard recipient authorization;
- domain-wide recipient authorization;
- bulk or parallel dispatch;
- automated retry of ambiguous dispatches;
- retry leases or claim expiry;
- dispatch recovery unless separately approved;
- automatic ministry outcome mutation from provider activity;
- automatic Six-Week task completion from provider activity;
- sending outside an explicitly approved production window.

## Roles

### Pilot approver

The pilot approver authorizes each production activation window.

The approver must confirm:

- the intended recipient cohort;
- the purpose of the window;
- that the cohort is within the pilot limit;
- that the provider and webhook readiness checks are current;
- that no unresolved prior dispatch or reconciliation issue exists.

Activation approval must be explicit and recorded before production sending is
enabled.

### Pilot operator

The pilot operator must be an authorized canonical administrator Staff actor.

The operator is responsible for:

- performing the preflight;
- applying only the approved temporary configuration;
- revalidating each delivery immediately before dispatch;
- dispatching one delivery at a time;
- inspecting the canonical delivery after each dispatch;
- verifying provider evidence;
- stopping on any ambiguity;
- performing mandatory rollback;
- recording the outcome without exposing secrets or recipient addresses.

## Entry criteria

A pilot window must not begin unless all of the following are true:

- the deployed backend checkpoint is known;
- `FEATURE_PHASE5_COMMUNICATIONS=false`;
- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false`;
- `FEATURE_MINISTRY_EMAIL_DISPATCH_RECOVERY=false` or absent;
- `MINISTRY_EMAIL_PROVIDER=resend`;
- Resend sender configuration is present;
- `FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK=true`;
- the Resend webhook signing secret is configured;
- the signed webhook boundary is healthy;
- the prior controlled production acceptance remains documented;
- there is no unresolved delivery in `dispatching`;
- there is no unresolved reconciliation-required delivery from a prior pilot
  window.

If any entry criterion fails, do not open the pilot window.

## Recipient eligibility

Every pilot recipient must be individually approved.

Immediately before creating or dispatching a delivery, verify:

- the canonical visitor exists;
- the canonical email address is the intended exact recipient;
- the address appears on the current exact-address allowlist;
- the applicable contact consent is true;
- the canonical email communication preference is `granted`;
- the communication intent is valid for that visitor and channel;
- the communication is not cancelled;
- no terminal ministry outcome already makes the communication inappropriate;
- the delivery belongs to the same visitor and communication;
- the delivery content is the approved content for that recipient.

Do not infer recipient authorization from ministry area, domain, household, or
similar grouping.

## Activation window

For each controlled pilot window:

1. start from the fail-closed production baseline;
2. configure `MINISTRY_EMAIL_RECIPIENT_POLICY=allowlist`;
3. configure only the explicitly approved exact recipient addresses;
4. verify the allowlist contains no more than five addresses;
5. verify no unexpected address is present;
6. obtain explicit activation approval;
7. enable only:
   - `FEATURE_PHASE5_COMMUNICATIONS=true`;
   - `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=true`;
8. verify the intended ARM settings;
9. prove sustained live convergence before dispatch.

## Flex Consumption convergence

ARM configuration readback alone is not sufficient proof that all active
workers have consumed the new app settings.

During the pilot:

- use repeated live data-plane probes;
- reset the readiness streak whenever a request reaches the previous feature
  state;
- require at least twenty consecutive Phase-5-enabled live reads before the
  first dispatch in a window;
- do not dispatch while mixed worker generations are still observed.

For rollback:

- verify ARM has returned to the fail-closed settings;
- require at least six consecutive live Phase-5-disabled reads;
- reset the rollback streak whenever an enabled worker is observed.

These thresholds are pilot safeguards. Changing them requires an explicit
runbook update.

## Delivery preparation

Each approved email must use the canonical delivery-request boundary.

Before dispatch, require the delivery inspection to show:

- state `requested`;
- no dispatch attempt ID;
- no dispatch claim timestamp;
- no provider;
- no provider message ID;
- assessment `not_claimed`;
- `reconciliationRequired=false`;
- `resendAuthorized=false`.

If any field differs, stop and investigate before dispatch.

## Sequential dispatch rule

Pilot deliveries must be dispatched one at a time.

For each delivery:

1. perform the final recipient and eligibility check;
2. perform the final canonical dispatch inspection;
3. issue exactly one dispatch HTTP request;
4. never place the dispatch call inside an automatic retry loop;
5. inspect canonical state immediately after the request;
6. resolve the result before considering the next delivery.

Do not dispatch a second pilot delivery while the previous delivery is in an
uncertain state.

## Dispatch outcomes

### provider_accepted

A canonical `provider_accepted` state proves that the provider synchronously
accepted the request.

It does not, by itself, prove recipient delivery.

Before advancing to the next pilot recipient, verify signed provider evidence
for the same delivery and dispatch attempt.

During the initial limited pilot, require signed evidence to include
`email.delivered` before dispatching the next recipient.

### failed

A canonical `failed` state is terminal for that delivery.

Do not retry the same delivery automatically.

Stop the pilot window and review the failure before approving any further
dispatch.

### dispatching

A canonical `dispatching` state is unresolved and requires reconciliation.

Do not retry, replace, reclaim, or manually edit the delivery.

Stop the pilot window and use the evidence-backed reconciliation process.

### requested after dispatch attempt

If the dispatch HTTP result is ambiguous and the canonical delivery still
appears `requested`, do not automatically rerun the dispatch.

Stop the window and investigate the original request outcome, worker state, and
canonical evidence before any new action.

## Invalid-content quarantine

If the exact-content preflight fails before any claim or provider execution:

- do not dispatch the delivery;
- do not delete or manually rewrite the stored delivery;
- canonically void the requested, unclaimed delivery through the authorized
  void boundary, `POST /api/ministry-email-deliveries/{deliveryId}/void` with a
  JSON body `{ "reason": "..." }` (1-240 characters, administrator only; the
  authenticated administrator is recorded as the voiding actor);
- verify dispatch inspection reports `state=voided`,
  `assessment=terminal_recorded`, `reconciliationRequired=false` and
  `resendAuthorized=false`;
- create any corrected message using a NEW `deliveryId`;
- repeat the exact-content preflight before approval.

A voided delivery remains permanent audit evidence. It is never retryable,
never dispatchable, and is not resurrected to `requested`. Only deliveries that
are still `requested` with no claim or provider result can be voided; a
`dispatching`, `provider_accepted` or `failed` delivery is rejected.
## Provider evidence

Provider evidence must be authenticated and correlated to:

- the exact provider;
- the exact delivery ID;
- the exact dispatch attempt ID;
- the canonical provider message ID when available.

Provider-event replay must remain idempotent.

The pilot operator may record event types and non-secret correlation
identifiers, but must not place recipient addresses, provider credentials,
webhook secrets, or provider message IDs in the pilot report.

## Ministry workflow isolation

After every dispatch, confirm that provider activity did not automatically
change ministry workflow state.

At minimum verify:

- no new `MinistryCommunicationOutcome` was created solely because of the
  provider send;
- no Six-Week event was created solely because of provider acceptance or
  delivery evidence.

Any unexpected ministry workflow mutation is an immediate pilot stop
condition.

## Mandatory rollback

Every activation window ends with fail-closed rollback.

Perform rollback even if all sends succeeded.

The required final state is:

- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false`;
- `FEATURE_PHASE5_COMMUNICATIONS=false`;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`;
- `MINISTRY_EMAIL_ALLOWED_RECIPIENTS` empty;
- dispatch recovery false or absent.

Preserve:

- delivery records;
- dispatch claims;
- provider results;
- provider evidence;
- reconciliation records.

Do not manually delete or rewrite production evidence to make a window appear
clean.

## Immediate stop conditions

Stop the pilot window and roll production back if any of these occurs:

- a recipient is not exactly approved;
- the allowlist contains an unexpected address;
- consent is no longer true;
- email preference is no longer granted;
- a communication is cancelled or otherwise ineligible;
- a delivery is not in the expected state;
- live worker convergence cannot be established;
- dispatch returns reconciliation-required;
- provider execution is uncertain;
- canonical delivery state is `dispatching`;
- provider evidence fails correlation;
- signed webhook verification is unavailable;
- an unexpected ministry workflow mutation occurs;
- production configuration drifts from the approved window;
- an operator cannot prove the current state.

When in doubt, stop and fail closed.

## Pilot recording

For each activation window, record:

- date and window identifier;
- deployed backend checkpoint;
- number of approved recipients;
- delivery IDs;
- dispatch request IDs;
- canonical dispatch statuses;
- reconciliation-required status;
- provider evidence event types;
- whether `email.delivered` was observed;
- ministry workflow isolation result;
- final rollback result.

Do not record recipient email addresses, secrets, administrator identifiers, or
provider message IDs in the repository.

## Pilot completion criteria

The limited pilot may be proposed for expansion only after all of the
following have been achieved:

- at least three separate controlled production windows;
- at least five distinct explicitly approved recipients in total;
- every dispatched delivery reached an understood terminal state;
- no unresolved reconciliation remains;
- signed evidence correlated correctly for every accepted delivery;
- `email.delivered` evidence was observed for every successful pilot
  recipient;
- no automatic dispatch retry occurred;
- no unexpected MinistryCommunicationOutcome mutation occurred;
- no unexpected Six-Week mutation occurred;
- every window completed fail-closed rollback;
- no recipient-policy violation occurred.

Meeting these criteria does not automatically authorize wider rollout.

A separate explicit production decision is still required before:

- increasing the pilot cohort limit;
- permitting parallel or bulk dispatch;
- maintaining a standing production allowlist;
- enabling dispatch recovery;
- using `MINISTRY_EMAIL_RECIPIENT_POLICY=all`;
- treating ministry email as routine unattended production operation.

## Current authorization state

The successful first controlled production acceptance proves the guarded send
path but is not counted as authorization for unrestricted sending.

This limited pilot policy authorizes only explicitly approved controlled
windows that comply with this runbook.

`MINISTRY_EMAIL_RECIPIENT_POLICY=all` remains unauthorized.
