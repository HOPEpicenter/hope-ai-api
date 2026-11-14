"""Phase C role-assignment inventory classification.

Inputs are untrusted observations, not authenticated Azure evidence.
No network, credentials, RBAC mutations, or cleanup authorization.
"""

from dataclasses import dataclass

from phase_c_cleanup_targets_v1 import assess_cleanup_targets


@dataclass(frozen=True)
class RoleInventoryAssessment:
    code: str
    cleanup_verified: bool = False


def assess_role_inventory(targets, inventory):
    """Classify an untrusted ARM role-assignment response.

    Never assert revocation from caller-provided data.
    """

    invalid = RoleInventoryAssessment("INVENTORY_UNAVAILABLE")

    if not assess_cleanup_targets(targets).valid:
        return invalid

    if type(inventory) is not dict:
        return invalid

    if set(inventory) != {"value", "nextLink"}:
        return invalid

    if inventory["nextLink"] is not None:
        return RoleInventoryAssessment("INVENTORY_INCOMPLETE")

    records = inventory["value"]

    if type(records) is not list:
        return invalid

    observed = set()

    for record in records:
        if type(record) is not dict:
            return invalid

        identifier = record.get("id")

        if type(identifier) is not str:
            return invalid

        # IDs must remain unique and nonempty.
        if not identifier or identifier in observed:
            return invalid

        observed.add(identifier)

    expected = set(targets.role_assignment_ids)

    if expected & observed:
        return RoleInventoryAssessment(
            "TEMPORARY_ASSIGNMENT_STILL_PRESENT"
        )

    # Absence in an unauthenticated or incomplete source cannot
    # establish revocation. This is classification only.
    return RoleInventoryAssessment(
        "ABSENCE_OBSERVED_NOT_VERIFIED"
    )
