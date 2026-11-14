"""Bind an operation intent to an existing durable reservation.

No trusted issuer, authorization, cloud access, or execution.
"""

import uuid

from phase_c_job_identity_v1 import (
    SUBSCRIPTION,
    RESOURCE_GROUP,
    AUTOMATION_ACCOUNT,
)

EXPECTED_SCOPE = (
    f"/subscriptions/{SUBSCRIPTION}"
    f"/resourceGroups/{RESOURCE_GROUP}"
    "/providers/Microsoft.Automation"
    f"/automationAccounts/{AUTOMATION_ACCOUNT}"
)


def _uuid4(value):
    if type(value) is not str:
        return False
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        return False
    return parsed.version == 4 and str(parsed) == value


def assess_operation_intent(
    ledger, operation_id, request_id, target_scope
):
    """Check reservation consistency; never grant execution."""
    if not _uuid4(operation_id):
        return "INVALID_OPERATION_ID"

    if not _uuid4(request_id):
        return "INVALID_REQUEST_ID"

    if type(target_scope) is not str:
        return "INVALID_TARGET_SCOPE"

    if target_scope != EXPECTED_SCOPE:
        return "TARGET_SCOPE_MISMATCH"

    operation = ledger.snapshot(operation_id)
    if operation is None:
        return "OPERATION_NOT_REGISTERED"

    reservation = ledger.get_job_creation_reservation(
        operation_id
    )
    if reservation is None:
        return "RESERVATION_NOT_FOUND"

    if reservation.get("request_id") != request_id:
        return "REQUEST_ID_MISMATCH"

    if reservation.get("state") != "UNRESOLVED":
        return "RESERVATION_STATE_INVALID"

    return "TRUSTED_AUTHORITY_NOT_CONNECTED"
