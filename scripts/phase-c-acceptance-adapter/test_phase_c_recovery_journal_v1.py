"""Synthetic Phase C recovery journal integrity tests."""

import unittest
import uuid

from phase_c_recovery_journal_v1 import (
    ZERO_HASH,
    assess_journal,
    event_hash,
)


class RecoveryJournalTests(unittest.TestCase):

    def setUp(self):
        self.operation = str(uuid.uuid4())
        self.journal = str(uuid.uuid4())

    def make_records(self):
        events = [
            "RECOVERY_REGISTERED",
            "RECOVERY_CLAIMED",
            "RECOVERY_ATTEMPT_FAILED",
        ]

        records = []
        previous = ZERO_HASH

        for index, event in enumerate(events):
            record = {
                "operation_id": self.operation,
                "journal_id": self.journal,
                "sequence": index,
                "event": event,
                "timestamp_utc": 1000 + index,
                "previous_hash": previous,
            }

            record["hash"] = event_hash(record)
            previous = record["hash"]
            records.append(record)

        return records

    def assess(self, records):
        return assess_journal(
            self.operation,
            self.journal,
            records,
        )

    def test_valid_chain_is_not_authenticated(self):
        result = self.assess(self.make_records())

        self.assertTrue(result.structurally_valid)
        self.assertFalse(result.authenticated)
        self.assertFalse(result.cleanup_verified)

    def test_tampered_event_denied(self):
        records = self.make_records()
        records[1]["event"] = "CLEANUP_OBSERVED"

        self.assertFalse(
            self.assess(records).structurally_valid
        )

    def test_missing_event_denied(self):
        records = self.make_records()
        del records[1]

        self.assertFalse(
            self.assess(records).structurally_valid
        )

    def test_reordered_events_denied(self):
        records = self.make_records()
        records[1], records[2] = records[2], records[1]

        self.assertFalse(
            self.assess(records).structurally_valid
        )

    def test_wrong_operation_denied(self):
        records = self.make_records()
        records[0]["operation_id"] = str(uuid.uuid4())

        self.assertFalse(
            self.assess(records).structurally_valid
        )

    def test_wrong_journal_denied(self):
        records = self.make_records()
        records[0]["journal_id"] = str(uuid.uuid4())

        self.assertFalse(
            self.assess(records).structurally_valid
        )

    def test_invalid_timestamp_denied(self):
        records = self.make_records()
        records[1]["timestamp_utc"] = True

        self.assertFalse(
            self.assess(records).structurally_valid
        )

    def test_extra_field_denied(self):
        records = self.make_records()
        records[0]["secret"] = "DO_NOT_ACCEPT"

        self.assertFalse(
            self.assess(records).structurally_valid
        )

    def test_empty_journal_denied(self):
        self.assertFalse(
            self.assess([]).structurally_valid
        )

    def test_untrusted_mapping_denied(self):
        self.assertFalse(
            self.assess({"value": []}).structurally_valid
        )

    def test_recomputed_chain_still_not_authenticated(self):
        records = self.make_records()

        records[1]["event"] = "CLEANUP_OBSERVED"
        records[1]["hash"] = event_hash(records[1])
        records[2]["previous_hash"] = records[1]["hash"]
        records[2]["hash"] = event_hash(records[2])

        result = self.assess(records)

        self.assertTrue(result.structurally_valid)
        self.assertFalse(result.authenticated)
        self.assertFalse(result.cleanup_verified)


if __name__ == "__main__":
    unittest.main()
