"""Fail-closed Phase C recovery scheduling decisions.

No Azure authority, timers, background process, or callback execution.
This contract interprets a ledger snapshot but never claims a lease.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RecoverySchedule:
    code: str
    claim_eligible: bool
    next_check_utc: int | None
    deadline_exceeded: bool


def assess_recovery_schedule(snapshot, now_utc):
    """Classify scheduling readiness without granting execution."""

    denied = RecoverySchedule(
        "SCHEDULE_UNAVAILABLE", False, None, False
    )

    if type(now_utc) is not int or now_utc < 0:
        return denied

    if type(snapshot) is not dict:
        return denied

    if set(snapshot) != {
        "state", "deadline_utc", "lease_until_utc", "attempts"
    }:
        return denied

    state = snapshot["state"]
    deadline = snapshot["deadline_utc"]
    lease = snapshot["lease_until_utc"]
    attempts = snapshot["attempts"]

    if type(deadline) is not int or deadline < 0:
        return denied

    if type(attempts) is not int or attempts < 0:
        return denied

    overdue = now_utc >= deadline

    if state == "RECOVERY_REQUIRED":
        if lease is not None:
            return denied

        return RecoverySchedule(
            "RECOVERY_DUE", True, now_utc, overdue
        )

    if state == "RECOVERY_IN_PROGRESS":
        if type(lease) is not int or lease < 0:
            return denied

        if attempts < 1:
            return denied

        if lease <= now_utc:
            return RecoverySchedule(
                "STALE_LEASE_RECLAIMABLE",
                True,
                now_utc,
                overdue,
            )

        return RecoverySchedule(
            "ACTIVE_LEASE",
            False,
            lease,
            overdue,
        )

    return denied
