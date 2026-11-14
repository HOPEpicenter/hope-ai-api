"""Synthetic Phase C journal anchor security tests."""

import unittest
import uuid

from phase_c_recovery_journal_v1 import ZERO_HASH, event_hash
from phase_c_journal_anchor_v1 import (
    JournalAnchor,
    assess_anchor_binding,
)


class JournalAnchorTests(unittest.TestCase):

    def setUp(self):
        self.operation = str(uuid.uuid4())
        self.journal = str(uuid.uuid4())

        self.records = []
        previous = ZERO_HASH

        for sequence, event in enumerate((
            "RECOVERY_REGISTERED",
            "RECOVERY_CLAIMED",
            "RECOVERY_ATTEMPT_FAILED",
        )):
            record = {
                "operation_id": self.operation,
                "journal_id": self.journal,
                "sequence": sequence,
                "event": event,
                "timestamp_utc": 1000 + sequence,
                "previous_hash": previous,
            }
            record["hash"] = event_hash(record)
            previous = record["hash"]
            self.records.append(record)

        self.anchor = JournalAnchor(
            self.operation,
            self.journal,
            2,
            self.records[-1]["hash"],
        )

    def assess(self, anchor=None, records=None):
        return assess_anchor_binding(
            self.operation,
            self.journal,
            self.records if records is None else records,
            self.anchor if anchor is None else anchor,
        )

    def test_matching_anchor_is_not_authenticated(self):
        result = self.assess()
        self.assertTrue(result.bound)
        self.assertEqual(
            result.code,
            "ANCHOR_MATCHED_UNAUTHENTICATED",
        )
        self.assertFalse(result.authenticated)
        self.assertFalse(result.cleanup_verified)

    def test_wrong_operation_denied(self):
        anchor = JournalAnchor(
            str(uuid.uuid4()),
            self.journal,
            2,
            self.anchor.final_hash,
        )
        self.assertFalse(self.assess(anchor).bound)

    def test_wrong_journal_denied(self):
        anchor = JournalAnchor(
            self.operation,
            str(uuid.uuid4()),
            2,
            self.anchor.final_hash,
        )
        self.assertFalse(self.assess(anchor).bound)

    def test_wrong_sequence_denied(self):
        anchor = JournalAnchor(
            self.operation,
            self.journal,
            1,
            self.anchor.final_hash,
        )
        self.assertFalse(self.assess(anchor).bound)

    def test_wrong_digest_denied(self):
        anchor = JournalAnchor(
            self.operation,
            self.journal,
            2,
            "a" * 64,
        )
        self.assertFalse(self.assess(anchor).bound)

    def test_missing_anchor_denied(self):
        result = assess_anchor_binding(
            self.operation, self.journal, self.records, None
        )
        self.assertFalse(result.bound)

    def test_untrusted_mapping_denied(self):
        result = assess_anchor_binding(
            self.operation,
            self.journal,
            self.records,
            vars(self.anchor),
        )
        self.assertFalse(result.bound)

    def test_modified_journal_denied(self):
        records = [dict(item) for item in self.records]
        records[1]["event"] = "CLEANUP_OBSERVED"
        records[1]["hash"] = event_hash(records[1])
        records[2]["previous_hash"] = records[1]["hash"]
        records[2]["hash"] = event_hash(records[2])

        self.assertFalse(self.assess(records=records).bound)

    def test_rewritten_anchor_is_still_untrusted(self):
        records = [dict(item) for item in self.records]
        records[1]["event"] = "CLEANUP_OBSERVED"
        records[1]["hash"] = event_hash(records[1])
        records[2]["previous_hash"] = records[1]["hash"]
        records[2]["hash"] = event_hash(records[2])

        rewritten = JournalAnchor(
            self.operation,
            self.journal,
            2,
            records[-1]["hash"],
        )

        result = self.assess(anchor=rewritten, records=records)
        self.assertTrue(result.bound)
        self.assertFalse(result.authenticated)
        self.assertFalse(result.cleanup_verified)

    def test_boolean_sequence_denied(self):
        anchor = JournalAnchor(
            self.operation,
            self.journal,
            True,
            self.anchor.final_hash,
        )
        self.assertFalse(self.assess(anchor).bound)


if __name__ == "__main__":
    unittest.main()
