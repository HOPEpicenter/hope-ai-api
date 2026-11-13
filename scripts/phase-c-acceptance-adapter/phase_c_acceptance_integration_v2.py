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
    except BaseException:
        return "CREDENTIAL_ACQUISITION_FAILED"

    try:
        evidence = run_wrapper(key)
    except BaseException as error:
        return classify_exception(error)
    finally:
        key = None

    try:
        return classify_output(evidence)
    except BaseException:
        return "INVALID_EVIDENCE"


def execution_authorized():
    """Preparation-only: live execution cannot be enabled."""
    return False