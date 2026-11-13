"""Phase C fail-closed recovery decision contract.

This module performs no Azure operations, authorizes no execution,
and does not independently authenticate supplied evidence.
Only a future trusted verifier may populate operational evidence.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RecoveryEvidence:
    vm_deallocated: bool
    managed_commands_empty: bool
    temporary_permissions_revoked: bool
    recovery_journal_verified: bool


@dataclass(frozen=True)
class RecoveryDecision:
    accepted: bool
    code: str


def assess_recovery(
    acceptance_succeeded: bool,
    evidence: RecoveryEvidence | None,
) -> RecoveryDecision:
    """Deny acceptance unless execution and all recovery checks pass."""

    if acceptance_succeeded is not True:
        return RecoveryDecision(False, "ACCEPTANCE_NOT_SUCCESSFUL")

    if type(evidence) is not RecoveryEvidence:
        return RecoveryDecision(False, "RECOVERY_EVIDENCE_MISSING")

    checks = (
        ("VM_NOT_VERIFIED_DEALLOCATED", evidence.vm_deallocated),
        ("RUN_COMMANDS_NOT_VERIFIED_EMPTY",
         evidence.managed_commands_empty),
        ("TEMPORARY_PERMISSIONS_NOT_VERIFIED_REVOKED",
         evidence.temporary_permissions_revoked),
        ("RECOVERY_JOURNAL_NOT_VERIFIED",
         evidence.recovery_journal_verified),
    )

    for code, value in checks:
        if value is not True:
            return RecoveryDecision(False, code)

    return RecoveryDecision(True, "RECOVERY_CONTRACT_SATISFIED")