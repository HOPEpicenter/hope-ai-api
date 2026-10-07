# Resend production readiness

## Purpose

This runbook controls production readiness and any explicitly approved
production activation of the ministry-email provider.

Successful staging acceptance does not authorize production sending.

Production must preserve the existing ministry-email safety model:

- backend remains authoritative;
- provider acceptance is not recipient delivery;
- durable dispatch claims are not retry leases;
- ambiguous provider execution never authorizes resend;
- provider evidence must correlate to the exact delivery and dispatch attempt;
- MinistryCommunicationOutcome is not mutated merely because email was sent;
- Six-Week state is not mutated merely because email was sent;
- production recipient policy fails closed unless explicitly configured.

## Production recipient policy

The backend supports:

- `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`
- `MINISTRY_EMAIL_RECIPIENT_POLICY=allowlist`
- `MINISTRY_EMAIL_RECIPIENT_POLICY=all`

Missing or invalid policy is treated as `deny_all`.

`MINISTRY_EMAIL_ALLOWED_RECIPIENTS` is a comma-separated set of exact email
addresses used only when the policy is `allowlist`.

The allowlist:

- is normalized case-insensitively;
- uses exact addresses only;
- does not support wildcard entries;
- does not support domain-wide entries;
- is enforced when a delivery is requested;
- is enforced again immediately before dispatch;
- blocks dispatch before a durable claim is acquired;
- blocks provider invocation for a disallowed recipient.

The initial production rollout must use `allowlist`.

`all` is not authorized for the initial production rollout and requires a
separate explicit production decision.

## Prepared production state

Before any production activation:

- the production sending domain is verified;
- a dedicated production sender credential exists;
- the production webhook exists with only supported provider events;
- the production webhook signing secret is configured;
- `MINISTRY_EMAIL_PROVIDER=resend`;
- `RESEND_API_KEY` is configured;
- `RESEND_FROM` uses the approved production domain;
- `FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK=true`;
- `FEATURE_PHASE5_COMMUNICATIONS=false`;
- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false`;
- `FEATURE_MINISTRY_EMAIL_DISPATCH_RECOVERY=false` or absent.

The recipient policy may remain absent or `deny_all` while production is
Prepared. That state cannot authorize a delivery request or provider dispatch.

## Controlled first-production window

Before enabling production sending:

1. Select the explicitly approved production recipient.
2. Verify the canonical visitor email is the intended recipient.
3. Verify the applicable Six-Week contact consent is true.
4. Verify the canonical email preference is granted.
5. Verify the communication is eligible and not cancelled.
6. Configure `MINISTRY_EMAIL_RECIPIENT_POLICY=allowlist`.
7. Configure `MINISTRY_EMAIL_ALLOWED_RECIPIENTS` with only the approved exact
   recipient address or explicitly approved small set.
8. Verify the production webhook remains authenticated and healthy.
9. Obtain explicit production activation approval.
10. Enable only:
    - `FEATURE_PHASE5_COMMUNICATIONS=true`
    - `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=true`
11. Create the approved delivery through the canonical administrative boundary.
12. Inspect the requested delivery before dispatch.
13. Dispatch exactly the approved delivery.
14. Do not retry if execution becomes uncertain or remains dispatching.
15. Confirm provider acceptance separately from recipient delivery.
16. Confirm signed provider evidence is persisted and correlated.
17. Confirm provider-event replay remains idempotent.
18. Confirm no MinistryCommunicationOutcome or Six-Week mutation occurs merely
    from provider acceptance or provider delivery evidence.
19. End the activation window immediately after acceptance.

## Mandatory rollback

The first rollback actions are:

1. set `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false`;
2. set `FEATURE_PHASE5_COMMUNICATIONS=false`.

Then return the recipient policy to a fail-closed state by either:

- setting `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`; or
- removing the policy so the backend defaults to `deny_all`.

Clear `MINISTRY_EMAIL_ALLOWED_RECIPIENTS` when the controlled window has ended
unless a continuing approved allowlist is intentionally required.

Do not:

- delete delivery records;
- delete provider evidence;
- clear durable dispatch claims;
- manually edit Azure Table rows;
- retry or replace an uncertain delivery merely because provider evidence is
  delayed.

If execution is uncertain, use the canonical dispatch inspection and
evidence-backed reconciliation path.

## Production activation authority

Provisioning production provider resources is not production activation.

Configuring webhook ingestion is not production activation.

Configuring an allowlist is not production activation.

Production sending begins only after an explicit approval to enable both
`FEATURE_PHASE5_COMMUNICATIONS` and
`FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING`.

The `all` recipient policy requires separate explicit approval and must not be
introduced as part of the first-production acceptance window.
