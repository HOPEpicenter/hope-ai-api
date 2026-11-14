"""Disabled trusted-operation authority contract.

Preparation-only. Neither caller assertions nor locally supplied
evidence can establish protected execution authority.
"""

from dataclasses import dataclass


DENIAL = "TRUSTED_OPERATION_AUTHORITY_NOT_CONNECTED"


@dataclass(frozen=True)
class OperationAuthorityScope:
    operation_id: str
    resource_scope: str
    runbook_name: str
    request_id: str
    expires_utc: int
    approval_provenance: str


def assess_trusted_operation_authority(
    scope=None,
    evidence=None,
    execution_enabled=False,
):
    """Never authorize execution without a protected verifier."""
    return DENIAL


def trusted_operation_verifier_available():
    """Protected authority integration has not been implemented."""
    return False
