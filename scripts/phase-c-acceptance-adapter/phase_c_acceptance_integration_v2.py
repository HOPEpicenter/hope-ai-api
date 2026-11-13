"""Synthetic Phase C integration boundary.

No real bridge import, Azure calls, secrets, or live entry point.
All callbacks must be synthetic fixtures.
"""

from phase_c_acceptance_adapter_v1 import (
    classify_output,
    classify_exception,
)


def simulate_transaction(acquire_key, run_wrapper):
    """Test exception containment using injected synthetic callbacks."""

    try:
        key = acquire_key()
    except Exception:
        return "CREDENTIAL_ACQUISITION_FAILED"

    if not isinstance(key, str) or not key:
        return "CREDENTIAL_ACQUISITION_FAILED"

    try:
        evidence = run_wrapper(key)
    except Exception as error:
        return classify_exception(error)
    finally:
        key = None

    try:
        return classify_output(evidence)
    except Exception:
        return "INVALID_EVIDENCE"


def execution_authorized():
    """Preparation-only: live execution cannot be enabled."""
    return False

def simulate_lifecycle(acquire_key, run_wrapper, cleanup, verify_cleanup):
    """Synthetic only; no trusted authorization or real resources.

    Attempt cleanup regardless of transaction outcome. A successful
    transaction is not accepted until cleanup is independently verified.
    """

    outcome = "EXECUTION_FAILURE"

    try:
        outcome = simulate_transaction(acquire_key, run_wrapper)
    except Exception:
        outcome = "EXECUTION_FAILURE"
    finally:
        try:
            cleanup()
        except Exception:
            outcome = "CLEANUP_FAILED"

    try:
        verified = verify_cleanup() is True
    except Exception:
        verified = False

    if not verified:
        return "CLEANUP_NOT_VERIFIED"

    if outcome == "CLEANUP_FAILED":
        return "CLEANUP_FAILED"

    return outcome