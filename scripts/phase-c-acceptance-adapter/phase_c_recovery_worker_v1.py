"""Disabled Phase C recovery worker boundary.

Synthetic attempts exercise local SQLite coordination only.
No injected callbacks, Azure operations, or success transitions.
"""

from phase_c_recovery_ledger_v1 import RecoveryLedger


def assess_recovery_attempt(
    ledger,
    operation_id,
    now_utc,
    synthetic_attempt=False,
):
    """Fail closed; never execute external recovery."""

    if type(ledger) is not RecoveryLedger:
        return "LEDGER_UNAVAILABLE"

    if type(synthetic_attempt) is not bool:
        return "INVALID_SYNTHETIC_ATTEMPT"

    if not synthetic_attempt:
        return "RECOVERY_EXECUTION_DISABLED"

    attempt = ledger.claim_recovery(operation_id, now_utc)

    if attempt is None:
        return "RECOVERY_NOT_CLAIMED"

    try:
        released = ledger.record_failure(operation_id, attempt)
    except Exception:
        return "RECOVERY_STATE_UNCERTAIN"

    if not released:
        return "RECOVERY_STATE_UNCERTAIN"

    return "RECOVERY_ATTEMPT_FAILED"
