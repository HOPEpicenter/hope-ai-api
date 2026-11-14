"""Durable Phase C recovery coordination regression tests.

Synthetic SQLite only. No Azure, credentials, network calls,
live recovery execution, or success transitions.
"""

import tempfile
import unittest
import uuid
from pathlib import Path

from phase_c_recovery_ledger_v1 import RecoveryLedger
from phase_c_recovery_schedule_v1 import assess_recovery_schedule
from phase_c_recovery_worker_v1 import assess_recovery_attempt


class RecoveryCoordinationTests(unittest.TestCase):

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.path = Path(self.temp.name) / "recovery.sqlite3"
        self.operation = str(uuid.uuid4())

        self.ledger = RecoveryLedger(self.path)
        self.ledger.register(self.operation, 2000)

    def schedule(self, now, ledger=None):
        source = ledger if ledger is not None else self.ledger
        snapshot = source.snapshot(self.operation)
        return assess_recovery_schedule(snapshot, now)

    def test_pending_recovery_detected(self):
        decision = self.schedule(1000)

        self.assertEqual(decision.code, "RECOVERY_DUE")
        self.assertTrue(decision.claim_eligible)

        # Scheduling alone must never claim work.
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"],
            0,
        )

    def test_active_lease_blocks_concurrent_attempt(self):
        attempt = self.ledger.claim_recovery(
            self.operation, 1000, 60
        )

        self.assertIsNotNone(attempt)

        decision = self.schedule(1030)

        self.assertEqual(decision.code, "ACTIVE_LEASE")
        self.assertFalse(decision.claim_eligible)

        result = assess_recovery_attempt(
            self.ledger,
            self.operation,
            1030,
            synthetic_attempt=True,
        )

        self.assertEqual(result, "RECOVERY_NOT_CLAIMED")

        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"],
            1,
        )

    def test_restart_recovers_expired_lease(self):
        first_attempt = self.ledger.claim_recovery(
            self.operation, 1000, 60
        )

        self.assertIsNotNone(first_attempt)

        # Simulate controller restart with a new ledger instance.
        restarted = RecoveryLedger(self.path)

        decision = self.schedule(1060, restarted)

        self.assertEqual(
            decision.code,
            "STALE_LEASE_RECLAIMABLE",
        )
        self.assertTrue(decision.claim_eligible)

        # The worker exercises coordination only.
        result = assess_recovery_attempt(
            restarted,
            self.operation,
            1060,
            synthetic_attempt=True,
        )

        self.assertEqual(result, "RECOVERY_ATTEMPT_FAILED")

        snapshot = restarted.snapshot(self.operation)

        self.assertEqual(snapshot["attempts"], 2)
        self.assertEqual(
            snapshot["state"],
            "RECOVERY_REQUIRED",
        )

        # Previous attempt must not overwrite a newer claim.
        self.assertFalse(
            restarted.record_failure(
                self.operation, first_attempt
            )
        )

    def test_live_execution_remains_disabled(self):
        before = self.ledger.snapshot(self.operation)

        result = assess_recovery_attempt(
            self.ledger,
            self.operation,
            1000,
        )

        after = self.ledger.snapshot(self.operation)

        self.assertEqual(
            result, "RECOVERY_EXECUTION_DISABLED"
        )
        self.assertEqual(before, after)

    def test_deadline_overrun_remains_recoverable(self):
        decision = self.schedule(2001)

        self.assertTrue(decision.deadline_exceeded)
        self.assertTrue(decision.claim_eligible)

        # Deadline expiration is not proof of cleanup.
        self.assertNotEqual(
            decision.code,
            "RECOVERY_CONTRACT_SATISFIED",
        )

    def test_unknown_operation_fails_closed(self):
        unknown = str(uuid.uuid4())

        snapshot = self.ledger.snapshot(unknown)

        decision = assess_recovery_schedule(
            snapshot, 1000
        )

        self.assertFalse(decision.claim_eligible)
        self.assertEqual(
            decision.code,
            "SCHEDULE_UNAVAILABLE",
        )


if __name__ == "__main__":
    unittest.main()
