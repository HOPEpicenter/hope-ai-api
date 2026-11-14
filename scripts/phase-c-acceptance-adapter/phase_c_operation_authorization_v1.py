"""Pure, fail-closed Phase C operation authorization assessment.

This module has no Azure execution capability.
Caller assertions are not proof of protected authorization.
"""

import uuid


def assess_operation_authorization(
    operation_id,
    approved_operation_id,
    approval_verified=False,
    replay_clear=False,
    execution_enabled=False,
):
    if execution_enabled is not False:
        return "EXECUTION_NOT_IMPLEMENTED"

    if approval_verified is not True:
        return "APPROVAL_NOT_VERIFIED"

    if replay_clear is not True:
        return "REPLAY_PROTECTION_NOT_VERIFIED"

    for value in (operation_id, approved_operation_id):
        if type(value) is not str:
            return "INVALID_OPERATION_ID"
        try:
            parsed = uuid.UUID(value)
        except (ValueError, AttributeError):
            return "INVALID_OPERATION_ID"
        if parsed.version != 4 or str(parsed) != value:
            return "INVALID_OPERATION_ID"

    if operation_id != approved_operation_id:
        return "OPERATION_SCOPE_MISMATCH"

    return "PROTECTED_AUTHORITY_NOT_CONNECTED"
