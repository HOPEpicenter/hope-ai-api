"""Phase C recovery journal structural integrity.

No trusted storage, credentials, Azure calls, or execution authority.
A consistent hash chain does not authenticate its origin.
"""

from dataclasses import dataclass
import hashlib
import json
import re
import uuid


ZERO_HASH = "0" * 64
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")

EVENTS = frozenset({
    "RECOVERY_REGISTERED",
    "RECOVERY_CLAIMED",
    "RECOVERY_ATTEMPT_FAILED",
    "CLEANUP_OBSERVED",
})


@dataclass(frozen=True)
class JournalAssessment:
    structurally_valid: bool
    code: str
    authenticated: bool = False
    cleanup_verified: bool = False


def _uuid4(value):
    if type(value) is not str:
        return False
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        return False
    return parsed.version == 4 and str(parsed) == value


def event_hash(record):
    """Deterministic hash of an exact, non-secret event record."""

    payload = {
        key: record[key]
        for key in (
            "operation_id",
            "journal_id",
            "sequence",
            "event",
            "timestamp_utc",
            "previous_hash",
        )
    }

    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )

    return hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def assess_journal(operation_id, journal_id, records):
    """Validate a bounded journal without trusting its publisher."""

    denied = JournalAssessment(False, "JOURNAL_INVALID")

    if not _uuid4(operation_id) or not _uuid4(journal_id):
        return denied

    if type(records) is not list or not 1 <= len(records) <= 256:
        return denied

    expected_fields = {
        "operation_id",
        "journal_id",
        "sequence",
        "event",
        "timestamp_utc",
        "previous_hash",
        "hash",
    }

    previous_hash = ZERO_HASH
    previous_time = -1

    for index, record in enumerate(records):
        if type(record) is not dict:
            return denied

        if set(record) != expected_fields:
            return denied

        if record["operation_id"] != operation_id:
            return denied

        if record["journal_id"] != journal_id:
            return denied

        if type(record["sequence"]) is not int:
            return denied

        if record["sequence"] != index:
            return denied

        if type(record["event"]) is not str:
            return denied

        if record["event"] not in EVENTS:
            return denied

        if index == 0 and record["event"] != "RECOVERY_REGISTERED":
            return denied

        timestamp = record["timestamp_utc"]

        if type(timestamp) is not int or timestamp < 0:
            return denied

        if timestamp < previous_time:
            return denied

        if type(record["previous_hash"]) is not str:
            return denied

        if record["previous_hash"] != previous_hash:
            return denied

        digest = record["hash"]

        if type(digest) is not str:
            return denied

        if HASH_PATTERN.fullmatch(digest) is None:
            return denied

        if digest != event_hash(record):
            return denied

        previous_hash = digest
        previous_time = timestamp

    return JournalAssessment(
        True,
        "JOURNAL_STRUCTURE_VALID_UNAUTHENTICATED",
        False,
        False,
    )
