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

    def attempt(self, now=1000):
        return assess_recovery_attempt(
            self.ledger,
            self.operation,
            now,
            synthetic_attempt=True,
        )

    def test_disabled_by_default(self):
        self.assertEqual(
            assess_recovery_attempt(
                self.ledger, self.operation, 1000
            ),
            "RECOVERY_EXECUTION_DISABLED",
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 0
        )

    def test_synthetic_attempt_remains_pending(self):
        self.assertEqual(
            self.attempt(), "RECOVERY_ATTEMPT_FAILED"
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["state"],
            "RECOVERY_REQUIRED",
        )

    def test_callable_injection_rejected(self):
        events = []

        with self.assertRaises(TypeError):
            assess_recovery_attempt(
                self.ledger,
                self.operation,
                1000,
                synthetic_callback=lambda: events.append("executed"),
            )

        self.assertEqual(events, [])
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 0
        )

    def test_active_lease_blocks_worker(self):
        self.ledger.claim_recovery(
            self.operation, 1000, 60
        )
        self.assertEqual(
            self.attempt(1001),
            "RECOVERY_NOT_CLAIMED",
        )

    def test_pending_recovery_can_retry(self):
        for now in (1000, 1010):
            self.assertEqual(
                self.attempt(now),
                "RECOVERY_ATTEMPT_FAILED",
            )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 2
        )

    def test_invalid_synthetic_attempt_denied(self):
        for invalid in ("run", 1, None, lambda: None):
            self.assertEqual(
                assess_recovery_attempt(
                    self.ledger,
                    self.operation,
                    1000,
                    synthetic_attempt=invalid,
                ),
                "INVALID_SYNTHETIC_ATTEMPT",
            )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 0
        )


if __name__ == "__main__":
    unittest.main()
