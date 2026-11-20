# Temporary kiosk private connectivity runner contract

Status: DESIGN ONLY - NOT AUTHORIZED FOR EXECUTION

## Scope

- Isolated Friends & Family kiosk, November 22, 2026.
- Existing acceptance backend only.
- No production or original staging integration.
- Reuse the reviewed private connectivity helpers.
- No new Azure resources or public HTTP endpoints.

## Required security boundaries

1. Existing exported diagnostic remains unconditionally disabled.
2. No timer, queue, or automatically scheduled execution.
3. No caller-controlled flag may constitute execution authority.
4. No visitor table enumeration, writes, or deletes.
5. No visitor information, token, or credential output.
6. DNS must resolve exclusively to the approved private range.
7. TLS must verify the expected Table account hostname.
8. Managed identity must be explicitly bound and verified.
9. Network operations must have bounded timeouts.
10. Logs and returned results contain only predefined statuses.
11. No deployment or live execution without separate authorization.
12. Any temporary execution mechanism requires an independent
    security review and explicit post-test disposition.

## Required acceptance evidence

- Exact approved Azure environment verified.
- Runtime diagnostic access mechanism independently reviewed.
- Actual private DNS and TLS result recorded.
- Managed identity acquisition status recorded.
- Account-level Table service response classified.
- Effective visitor-table permissions verified separately.
- End-to-end submission requires separate authorization.
- No automated visitor contact.
- Permanent Ministry OS remains unchanged.

## Implementation decision

Prepare a minimal, isolated, non-HTTP diagnostic execution
mechanism using the existing backend and reviewed helpers.

The source-level disabled production export must not be
weakened or bypassed.

This contract does not authorize implementation deployment,
Azure mutations, live network requests, or visitor operations.