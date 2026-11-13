"""Disabled Phase C recovery worker boundary.

This module never starts Azure recovery. Synthetic callback invocation
is explicitly confined to tests. Lease claims are coordination only,
not permission to operate Azure resources.
"""

from phase_c_recovery_ledger_v1 import RecoveryLedger


def assess_recovery_attempt(
    ledger,
    operation_id,
    now_utc,
    synthetic_callback=None,
):
    """Claim work but fail closed; no terminal success transition."""

    if type(ledger) is not RecoveryLedger:
        return "LEDGER_UNAVAILABLE"

    # Production execution is deliberately unavailable.
    # A callback cannot authorize real recovery.
    if synthetic_callback is None:
        return "RECOVERY_EXECUTION_DISABLED"

    if not callable(synthetic_callback):
        return "INVALID_SYNTHETIC_CALLBACK"

    attempt = ledger.claim_recovery(operation_id, now_utc)

    if attempt is None:
        return "RECOVERY_NOT_CLAIMED"

    outcome = "RECOVERY_ATTEMPT_FAILED"

    try:
        synthetic_callback()
    except Exception:
        outcome = "RECOVERY_ATTEMPT_FAILED"
    finally:
        # No operation is marked verified or complete.
        try:
            released = ledger.record_failure(
                operation_id, attempt
            )
        except Exception:
            return "RECOVERY_STATE_UNCERTAIN"

        if not released:
            return "RECOVERY_STATE_UNCERTAIN"

    return outcome