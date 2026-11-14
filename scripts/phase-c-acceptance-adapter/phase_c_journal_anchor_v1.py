"""Phase C journal anchor binding.

Validates a journal against supplied anchor metadata.

This module does not authenticate the anchor's publisher,
verify external storage, authorize recovery, or prove cleanup.
No callbacks, network calls, credentials, or Azure operations.
"""

from dataclasses import dataclass
import re

from phase_c_recovery_journal_v1 import assess_journal


HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class JournalAnchor:
    operation_id: str
    journal_id: str
    final_sequence: int
    final_hash: str


@dataclass(frozen=True)
class AnchorAssessment:
    bound: bool
    code: str
    authenticated: bool = False
    cleanup_verified: bool = False


def assess_anchor_binding(operation_id, journal_id, records, anchor):
    """Match journal head to an exact anchor; never grant authority."""

    denied = AnchorAssessment(False, "ANCHOR_UNVERIFIED")

    journal = assess_journal(operation_id, journal_id, records)

    if not journal.structurally_valid:
        return denied

    if type(anchor) is not JournalAnchor:
        return denied

    if anchor.operation_id != operation_id:
        return denied

    if anchor.journal_id != journal_id:
        return denied

    if type(anchor.final_sequence) is not int:
        return denied

    if anchor.final_sequence != len(records) - 1:
        return denied

    if type(anchor.final_hash) is not str:
        return denied

    if HASH_PATTERN.fullmatch(anchor.final_hash) is None:
        return denied

    if anchor.final_hash != records[-1]["hash"]:
        return denied

    return AnchorAssessment(
        True,
        "ANCHOR_MATCHED_UNAUTHENTICATED",
        False,
        False,
    )
