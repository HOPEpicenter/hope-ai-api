# HOPE Ministry OS — OAuth Credential Encryption Architecture v1

Status: Proposed — design only
Baseline: OAuth Credential Storage Contract v1, backend PR #1295
Classification: Security architecture; no credential material

## 1. Purpose

Protect Microsoft Entra user-bound OAuth refresh tokens exclusively in
trusted backend infrastructure, with environment isolation, encrypted
persistence, explicit session ownership, safe rotation and revocation.

No current authentication behavior changes under this proposal.

## 2. Observed baseline

- Existing backend persistence: Azure Table Storage.
- Existing concurrency: ETag updates and same-partition transactions.
- Credential Storage Contract v1 is merged.
- Staging and production Function Apps have no managed identities.
- No Key Vault was found in the inspected Azure subscription.
- No application-level OAuth credential encryption is implemented.
- The dashboard uses NextAuth JWT sessions without a database adapter.
- The dashboard token-refresh helper remains isolated and default-off.

## 3. Proposed environment isolation

Staging:
- Dedicated staging Key Vault.
- Dedicated staging Function App managed identity.
- Dedicated staging RSA key and credential table.

Production:
- Dedicated production Key Vault.
- Dedicated production Function App managed identity.
- Dedicated production RSA key and credential table.

No cross-environment key or credential-store permissions.
No shared credential encryption keys with ordinary ministry data.
Use Azure RBAC and grant minimum required key permissions.

## 4. Proposed cryptographic envelope

Generate a new 256-bit random data-encryption key per credential
encryption operation.

Generate a fresh 96-bit AES-GCM nonce per operation.

Encrypt credential plaintext with AES-256-GCM using authenticated
additional data derived from stable record and owner binding fields.

Wrap the data-encryption key using Azure Key Vault RSA-OAEP-256.

Persist:
- Versioned envelope schema identifier.
- AES-256-GCM algorithm identifier.
- RSA-OAEP-256 wrapping algorithm identifier.
- Exact versioned Key Vault key reference.
- Wrapped data-encryption key.
- Nonce, ciphertext and authentication tag.
- Encoding identifiers and authentication-data binding version.

Never persist plaintext credentials, unwrapped data keys or client secrets.

Use authenticated encryption for the token payload and its required
immutable ownership context.

Specify a canonical byte encoding before implementation. The proposed
encoding is base64url without padding.

## 5. Contract versioning

Deployed OAuth Credential Storage Contract v1 must remain unchanged.

Introduce a separately named v2 envelope contract before implementing
persistence of wrapped keys.

Do not reinterpret existing v1 fields as v2 fields.
Reject unsupported schema versions without fallback decryption.

## 6. Trusted session and identity binding

A credential belongs to one verified Entra tenant, Entra object ID,
canonical HOPE Staff Identity and unique authenticated session binding.

Credential ID must be opaque and independent of staff ID.

Never authorize reads, writes or token refreshes solely from a
client-supplied credential ID or owner object.

Verify identity and session binding from trusted authentication context.
Never expose raw refresh tokens in browser sessions or HTTP responses.

## 7. Repository and concurrency requirements

Use a dedicated credential storage namespace with restricted access.

Use an ETag-based conditional update for credential rotation.
In the same partition, atomically write the safe rotation audit record.

Concurrent stale writers must fail closed.
Revocation must prevent subsequent refresh attempts.
A revoked credential must not become active through a racing update.

The future repository must define retry/idempotency policy without
replaying token refresh blindly.

## 8. Key version rotation

New encryptions use the approved current key version.

Decrypt and unwrap existing records using their recorded key version.

Retain authorized access to previous versions while records that
depend on them remain valid.

Rewrap data keys to a newer key version using conditional writes,
with separate verification and safe audit metadata.

Do not disable or purge previous key versions before rewrap and
recovery verification.

Define explicit emergency-revocation and credential-reauthorization
procedures.

## 9. Failure behavior

Fail closed when:
- Key Vault is unavailable.
- Key reference or envelope encoding is invalid.
- The key is disabled, missing or unauthorized.
- AES-GCM authentication fails.
- Session or owner binding differs.
- The credential is expired or revoked.
- The expected ETag or revision does not match.

Do not log credentials, key material, encrypted payloads or raw provider
responses. Emit sanitized error categories and correlation IDs only.

## 10. Infrastructure approvals required

Before provisioning any resource:
- Confirm Azure subscription and resource-group boundaries.
- Confirm RBAC role-assignment authorization.
- Confirm Function App managed-identity support.
- Confirm Key Vault network reachability and firewall requirements.
- Review vault soft-delete, purge protection, backup and recovery.
- Review key rotation and old-version retention.
- Review access logging, monitoring and cost.
- Obtain explicit approval for staging provisioning first.

Production provisioning requires a separate authorization.

## 11. Proposed implementation sequence

PR A: This architecture document only.
PR B: Versioned encrypted-envelope contract with offline tests.
PR C: Local AES-GCM cryptography adapter using synthetic data.
PR D: Key Vault key-wrapping adapter with mocked service tests.
PR E: Dedicated credential repository with ETag concurrency tests.
PR F: Server-side session/credential binding integration.
PR G: Controlled staging acceptance and authorization verification.

Keep all new behavior disabled until explicitly approved.

## 12. Security acceptance tests

Require:
- No plaintext credential storage or logging.
- No token material in browser-visible sessions.
- Wrong session and wrong staff identity rejected.
- Wrong environment or key reference rejected.
- Corrupted ciphertext, nonce and tag rejected.
- Replay and stale ETag writes rejected.
- Concurrent rotations permit only one successful writer.
- Revoked credentials cannot refresh.
- Old key versions remain usable until verified rewrap.
- All tests use synthetic credentials and test-only keys.

## 13. Open design decisions

- Exact storage partition and row-key derivation.
- Per-session identifier generation and trusted lifecycle.
- Azure Storage access isolation from general ministry repositories.
- Key Vault access model and network controls.
- Key cache policy and rate limiting.
- Key rotation frequency and credential retention.
- Backup and disaster-recovery strategy.
- Explicit expiry semantics for revoked/expired records.
- Dashboard-to-backend trusted token handoff.

These decisions must be resolved before live persistence.
