"""Synthetic recovery worker tests; never connect to Azure."""

import tempfile
import unittest
import uuid
from pathlib import Path

from phase_c_recovery_ledger_v1 import RecoveryLedger
from phase_c_recovery_worker_v1 import assess_recovery_attempt


class RecoveryWorkerTests(unittest.TestCase):

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.ledger = RecoveryLedger(
            Path(self.temp.name) / "ledger.sqlite3"
        )
        self.operation = str(uuid.uuid4())
        self.ledger.register(self.operation, 2000)

    def test_disabled_without_callback(self):
        result = assess_recovery_attempt(
            self.ledger, self.operation, 1000
        )
        self.assertEqual(
            result, "RECOVERY_EXECUTION_DISABLED"
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 0
        )

    def test_synthetic_attempt_remains_pending(self):
        events = []
        result = assess_recovery_attempt(
            self.ledger,
            self.operation,
            1000,
            synthetic_callback=lambda: events.append("called"),
        )
        self.assertEqual(events, ["called"])
        self.assertEqual(
            result, "RECOVERY_ATTEMPT_FAILED"
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["state"],
            "RECOVERY_REQUIRED",
        )

    def test_callback_exception_is_contained(self):
        def fail():
            raise RuntimeError("DO_NOT_DISCLOSE")

        result = assess_recovery_attempt(
            self.ledger,
            self.operation,
            1000,
            synthetic_callback=fail,
        )
        self.assertEqual(
            result, "RECOVERY_ATTEMPT_FAILED"
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["state"],
            "RECOVERY_REQUIRED",
        )

    def test_active_lease_blocks_worker(self):
        self.ledger.claim_recovery(
            self.operation, 1000, 60
        )
        events = []

        result = assess_recovery_attempt(
            self.ledger,
            self.operation,
            1001,
            synthetic_callback=lambda: events.append("called"),
        )

        self.assertEqual(result, "RECOVERY_NOT_CLAIMED")
        self.assertEqual(events, [])

    def test_pending_recovery_can_retry(self):
        for now in (1000, 1010):
            self.assertEqual(
                assess_recovery_attempt(
                    self.ledger,
                    self.operation,
                    now,
                    synthetic_callback=lambda: None,
                ),
                "RECOVERY_ATTEMPT_FAILED",
            )

        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 2
        )

    def test_invalid_callback_denied(self):
        result = assess_recovery_attempt(
            self.ledger,
            self.operation,
            1000,
            synthetic_callback="run",
        )
        self.assertEqual(
            result, "INVALID_SYNTHETIC_CALLBACK"
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 0
        )


if __name__ == "__main__":
    unittest.main()