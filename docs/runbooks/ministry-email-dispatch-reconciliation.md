# Ministry email dispatch reconciliation

## Current capability

The internal readMinistryEmailDispatchInspection reader inspects one delivery
by deliveryId. The administrative HTTP inspection endpoint exposes that reader
through GET /api/ministry-email-deliveries/{deliveryId}/dispatch-inspection.

The HTTP boundary requires the canonical administrative Staff actor check before
inspection. The reader itself remains authorization-agnostic so internal callers
must establish their own approved authorization boundary.

This slice introduces no recovery write, claim reset, provider lookup, retry,
reclaim, concrete sending implementation, provider credentials, or send action.

Inspection remains available while sending flags are off. It reports an explicit
allowlist of lifecycle metadata. It omits subject, body, recipient email, staff
and visitor identities, eligibility data, and raw failure or exception messages.
Provider message IDs are internal operational metadata; restrict their access.

## Interpret the snapshot

- requested / not_claimed: no durable claim is recorded in this snapshot.
  Inspection does not authorize a send.
- dispatching / execution_unresolved: an execution was durably claimed.
  Provider invocation or acceptance cannot be inferred from the row alone.
- provider_accepted / terminal_recorded: recorded provider acceptance.
  This does not prove delivery to the recipient.
- failed / terminal_recorded: a terminal provider failure is recorded.
  This does not authorize another attempt.
- invalid or unavailable inspection: do not infer state or resend safety.

The snapshot can become stale immediately. Claim age is informational only.
An old claim is not an expired lease. A future claim timestamp yields unknown age.

## Procedure for unresolved execution

1. Record deliveryId, dispatchAttemptId, claim timestamp and inspection timestamp
   in the approved restricted incident record. Do not copy message contents,
   recipient email, credentials, authorization headers or raw provider errors.
2. Keep this delivery blocked from automatic resend, reset and reclaim.
3. Gather trustworthy execution/provider evidence for the exact attempt.
   Database age, missing logs, or an absent provider search result alone are
   insufficient proof that no external send occurred.
4. Escalate for an explicitly authorized, audited recovery decision.
   There is currently no manual recovery command in this slice.
5. Reinspect before any future approved resolution. That resolution must verify
   attempt identity, concurrency, evidence and actor authority independently.

Do not manually edit Azure Table rows or invoke the provider-result persistence
service as an operator recovery shortcut. That service is a worker persistence
boundary and does not verify recovery evidence or administrative authority.

## Remaining activation gate

Before real sending, implement and validate evidence-backed resolution with
operator audit, concurrency protection and replay semantics. Ambiguous evidence
must leave the delivery unresolved. Recovery mutation, provider integration,
configuration, safe observability and controlled acceptance remain separate gates.

No resolution should mutate MinistryCommunicationOutcome or Six-Week state
merely because a provider accepted a message.

## Internal evidence-backed recovery foundation

Recovery resolution is internal only. There is no recovery HTTP command in this
slice.

A resolution requires affirmative normalized evidence bound to the exact
deliveryId and dispatchAttemptId. Absence of provider evidence, claim age,
missing logs, recipient reports, or a provider search with no result never
authorizes resolution or resend.

Accepted evidence categories are:

- affirmative provider acceptance evidence from a captured send response,
  verified provider event, or verified provider activity record;
- a synchronous captured provider rejection response with a normalized failure
  code.

Provider events that occur after API acceptance, including later delivery
failures, still prove provider acceptance and must not be reclassified as a
synchronous provider rejection.

Successful recovery atomically commits the ETag-protected delivery terminal
transition and an immutable recovery audit entity in the same
MinistryEmailDeliveries table partition. A stale delivery version or recovery
audit conflict commits neither operation.

resolutionId is the replay identity. An exact replay returns the prior recovery
result without another mutation. Reusing a resolutionId with different evidence,
actor attribution, attempt identity, timestamps, or decision is a conflict.

Recovery performs no provider invocation and cannot authorize resend. It does
not mutate MinistryCommunicationOutcome or Six-Week state.

The future recovery HTTP boundary must independently establish canonical
administrative actor authorization before supplying actorId to the internal
recovery service.

## Authorized recovery HTTP command

The administrative recovery command is exposed through:

POST /api/ministry-email-deliveries/{deliveryId}/dispatch-recovery

The endpoint is independently gated by
FEATURE_MINISTRY_EMAIL_DISPATCH_RECOVERY, which defaults off.

When the flag is off the endpoint returns unavailable before administrative
authorization or recovery storage access.

When enabled, the endpoint requires the canonical administrative Staff actor
boundary. actorId is always taken from the authenticated canonical Staff
identity and is never trusted from the request body.

The request must supply a stable resolutionId, dispatchAttemptId, resolvedAt,
and affirmative normalized evidence. resolvedAt is part of recovery replay
identity; an exact administrative retry must reuse the same resolutionId,
resolvedAt, dispatch attempt, and evidence.

The route deliveryId is authoritative for the recovery command. Any mismatch
between route identity, dispatchAttemptId, and evidence identity is rejected by
the recovery foundation.

A newly committed resolution returns HTTP 201. An exact replay returns HTTP
200. Conflicting state, stale attempts, conflicting replay identity, or a
concurrent terminal transition return HTTP 409. Uncertain persistence returns
HTTP 503 and never authorizes resend.

This endpoint does not invoke SendGrid, look up provider state, authorize a
resend, reset or reclaim a dispatch claim, mutate MinistryCommunicationOutcome,
or mutate Six-Week state.

## SendGrid provider-event evidence normalization

Provider-event evidence normalization remains internal and performs no HTTP
webhook handling, signature verification, storage mutation, provider lookup,
recovery mutation or email sending.

Future SendGrid sends must attach only opaque non-PII correlation values:

- hope_delivery_id = canonical deliveryId
- hope_dispatch_attempt_id = durable dispatchAttemptId

These values are intended for SendGrid custom_args so they can return with
Event Webhook records. Do not place visitor names, recipient email addresses,
staff identities, message content, ministry data or other PII in custom_args.

Only provider events whose request provenance has already been cryptographically
verified may become recovery evidence. The future webhook boundary must verify
SendGrid's signature against the original raw request bytes before marking an
event signatureVerified.

The following delivery events are accepted as affirmative evidence that SendGrid
possessed and processed the exact correlated dispatch attempt:

- processed
- delivered
- deferred
- bounce
- dropped

All normalize to recovery kind provider_accepted with source
verified_provider_event. Later delivery failure does not retroactively mean the
provider rejected the Mail Send request.

The normalizer requires:

- exact deliveryId correlation;
- exact dispatchAttemptId correlation;
- sg_event_id;
- sg_message_id;
- integer Unix event timestamp;
- an allowlisted delivery event;
- verified provenance.

sg_event_id becomes evidenceId. sg_message_id becomes providerMessageId. The
provider timestamp is converted to canonical ISO evidence observedAt.

Unsupported engagement/account events, unsigned events, missing identifiers,
malformed timestamps and mismatched correlation remain unusable evidence.
Absence of a provider event is never negative evidence and never authorizes
resend.

Raw recipient email, provider reason/response strings and other webhook payload
content are not copied into normalized recovery evidence.

## Signed SendGrid Event Webhook HTTP boundary

The SendGrid Event Webhook HTTP boundary is independently gated by
FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK, which defaults off.

The boundary authenticates SendGrid with the signed Event Webhook headers and
SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY. It does not use HOPE administrative actor
headers because the external provider is the caller.

Verification order is fail-closed:

1. require the feature flag;
2. require configured public key;
3. require signature and timestamp headers;
4. require original request bytes;
5. verify the signature over the untouched raw payload;
6. only then parse JSON;
7. only then normalize supported provider events.

The handler prefers req.bufferBody when it is a non-empty Buffer, falls back to
req.rawBody when it is a non-empty string, and never reconstructs signed input
from req.body or JSON.stringify(req.body).

This slice deliberately does not persist verified evidence. Even after successful
signature verification and normalization it returns HTTP 503 with
MINISTRY_EMAIL_EVENT_WEBHOOK_PERSISTENCE_UNAVAILABLE. A non-2xx response keeps
the provider from treating the event batch as durably accepted before idempotent
evidence persistence exists.

The endpoint performs no provider invocation, email sending, dispatch recovery,
retry, reset, reclaim, MinistryCommunicationOutcome mutation or Six-Week
mutation. Do not enable FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK in Azure until the
durable evidence-persistence slice has been implemented and accepted.

## Durable provider-evidence ingestion

Verified supported provider events are durably persisted only after correlation
against the canonical MinistryEmailDeliveries row. The event deliveryId must
resolve to an existing delivery and its current dispatchAttemptId must exactly
match the signed event correlation value.

Provider-evidence rows are immutable create-only records in the shared
EMAIL_DELIVERIES partition. Their Azure row keys use a deterministic SHA-256
identity rather than copying the raw provider event ID into the key.

Exact provider-event replays are idempotent. Reusing the same evidence identity
with different canonical evidence is a conflict. Lost write acknowledgement is
resolved by rereading the deterministic evidence row; an absent or unreadable
row after an uncertain write remains persistence-uncertain.

Webhook batches use a two-phase process. All supported events first pass
canonical delivery/attempt correlation and in-batch evidence-identity conflict
checks before any evidence write occurs. Evidence records are then persisted
individually. If a later write is uncertain, the endpoint returns non-2xx and a
provider retry safely replays any rows that were already committed.

Unsupported non-delivery events are ignored after signature verification and do
not require persistence. A webhook receives HTTP 200 only when every supported
event was either newly persisted or proven to be an exact replay.

Durable provider evidence does not mutate the delivery lifecycle. It does not
invoke recovery, authorize resend, update MinistryCommunicationOutcome, or
update Six-Week state. The webhook feature remains default-off until controlled
staging configuration and acceptance are explicitly authorized.