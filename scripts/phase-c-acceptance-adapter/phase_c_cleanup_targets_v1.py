"""Strict Phase C cleanup target validation.

Untrusted identifiers are never cleanup evidence or execution authority.
No Azure calls, role assignments, credentials, or success transitions.
"""

from dataclasses import dataclass
import re
import uuid


SUBSCRIPTION = "fbafd6e4-21ad-41d9-8f98-091c3c73ded2"
RESOURCE_GROUP = "rg-hope-ai-api-staging"
VM_NAME = "vm-hope-c6-acceptance"

ROLE_ID = re.compile(
    r"^/subscriptions/" + re.escape(SUBSCRIPTION) +
    r"/resourceGroups/" + re.escape(RESOURCE_GROUP) +
    r"/providers/Microsoft\.Authorization/"
    r"roleAssignments/"
    r"([0-9a-f]{8}-[0-9a-f]{4}-"
    r"[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"
)


@dataclass(frozen=True)
class CleanupTargets:
    operation_id: str
    journal_id: str
    role_assignment_ids: tuple[str, ...]


@dataclass(frozen=True)
class TargetAssessment:
    valid: bool
    code: str
    cleanup_verified: bool = False


def _canonical_uuid(value):
    if type(value) is not str:
        return False
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        return False
    return parsed.version == 4 and str(parsed) == value


def assess_cleanup_targets(targets):
    """Validate identifiers without verifying resource state."""

    denied = TargetAssessment(False, "TARGETS_INVALID")

    if type(targets) is not CleanupTargets:
        return denied

    if not _canonical_uuid(targets.operation_id):
        return denied

    if not _canonical_uuid(targets.journal_id):
        return denied

    assignments = targets.role_assignment_ids

    if type(assignments) is not tuple or not assignments:
        return denied

    if len(assignments) > 32:
        return denied

    if any(type(item) is not str for item in assignments):
        return denied

    if len(set(assignments)) != len(assignments):
        return denied

    for item in assignments:
        match = ROLE_ID.fullmatch(item)

        if match is None:
            return denied

        if not _canonical_uuid(match.group(1)):
            return denied

    return TargetAssessment(
        True,
        "TARGET_IDENTIFIERS_VALID_UNVERIFIED",
        False,
    )
