"""Phase C durable recovery ledger regressions. No Azure calls."""

import sqlite3
from contextlib import closing
import tempfile
import unittest
import uuid
from pathlib import Path

from phase_c_recovery_ledger_v1 import RecoveryLedger


class RecoveryLedgerTests(unittest.TestCase):

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "recovery.sqlite3"
        self.ledger = RecoveryLedger(self.path)
        self.operation = str(uuid.uuid4())

    def register(self):
        self.ledger.register(self.operation, 2000)

    def test_initial_state_requires_recovery(self):
        self.register()
        state = self.ledger.snapshot(self.operation)
        self.assertEqual(state["state"], "RECOVERY_REQUIRED")
        self.assertEqual(state["attempts"], 0)

    def test_state_survives_new_ledger_instance(self):
        self.register()
        reopened = RecoveryLedger(self.path)
        self.assertEqual(
            reopened.snapshot(self.operation)["state"],
            "RECOVERY_REQUIRED",
        )

    def test_duplicate_operation_rejected(self):
        self.register()
        with self.assertRaises(sqlite3.IntegrityError):
            self.register()
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 0
        )

    def test_first_claim_is_atomic(self):
        self.register()
        attempt = self.ledger.claim_recovery(self.operation, 1000)
        self.assertIsNotNone(attempt)
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 1
        )

    def test_active_lease_blocks_second_claim(self):
        self.register()
        self.assertIsNotNone(
            self.ledger.claim_recovery(self.operation, 1000)
        )
        self.assertIsNone(
            RecoveryLedger(self.path).claim_recovery(
                self.operation, 1001
            )
        )

    def test_expired_lease_can_be_recovered(self):
        self.register()
        first = self.ledger.claim_recovery(
            self.operation, 1000, 30
        )
        second = RecoveryLedger(self.path).claim_recovery(
            self.operation, 1030
        )
        self.assertNotEqual(first, second)
        self.assertEqual(
            self.ledger.snapshot(self.operation)["attempts"], 2
        )

    def test_old_attempt_cannot_clear_new_attempt(self):
        self.register()
        first = self.ledger.claim_recovery(
            self.operation, 1000, 30
        )
        second = self.ledger.claim_recovery(
            self.operation, 1030
        )
        self.assertFalse(
            self.ledger.record_failure(self.operation, first)
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation)["state"],
            "RECOVERY_IN_PROGRESS",
        )
        self.assertTrue(
            self.ledger.record_failure(self.operation, second)
        )

    def test_failed_attempt_remains_recoverable(self):
        self.register()
        attempt = self.ledger.claim_recovery(
            self.operation, 1000
        )
        self.assertTrue(
            self.ledger.record_failure(self.operation, attempt)
        )
        self.assertEqual(
            RecoveryLedger(self.path).snapshot(
                self.operation
            )["state"],
            "RECOVERY_REQUIRED",
        )

    def test_unknown_operation_cannot_be_claimed(self):
        self.assertIsNone(
            self.ledger.claim_recovery(self.operation, 1000)
        )

    def test_invalid_operation_identifier_rejected(self):
        with self.assertRaises(ValueError):
            self.ledger.register("staff-identifier", 2000)

    def test_noninteger_time_rejected(self):
        with self.assertRaises(ValueError):
            self.ledger.register(self.operation, "2000")

    def test_job_observation_requires_registered_operation(self):
        job = str(uuid.uuid4())
        with self.assertRaises(sqlite3.IntegrityError):
            self.ledger.record_job_observation(
                self.operation, job
            )

    def test_job_observation_survives_reopen(self):
        self.register()
        job = str(uuid.uuid4())
        self.ledger.record_job_observation(self.operation, job)

        result = RecoveryLedger(
            self.path
        ).list_job_observations(self.operation)

        self.assertEqual(
            result,
            [{"job_id": job, "binding_verified": False}],
        )

    def test_job_cannot_bind_to_another_operation(self):
        self.register()
        other = str(uuid.uuid4())
        self.ledger.register(other, 2000)
        job = str(uuid.uuid4())
        self.ledger.record_job_observation(
            self.operation, job
        )

        with self.assertRaises(sqlite3.IntegrityError):
            self.ledger.record_job_observation(other, job)

    def test_duplicate_observation_rejected(self):
        self.register()
        job = str(uuid.uuid4())
        self.ledger.record_job_observation(
            self.operation, job
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.ledger.record_job_observation(
                self.operation, job
            )

    def test_multiple_jobs_remain_unverified(self):
        self.register()
        jobs = [str(uuid.uuid4()) for _ in range(2)]
        for job in jobs:
            self.ledger.record_job_observation(
                self.operation, job
            )

        observations = self.ledger.list_job_observations(
            self.operation
        )
        self.assertEqual(len(observations), 2)
        self.assertTrue(all(
            item["binding_verified"] is False
            for item in observations
        ))

    def test_invalid_job_identifier_rejected(self):
        self.register()
        with self.assertRaises(ValueError):
            self.ledger.record_job_observation(
                self.operation, "invalid-job"
            )

    def test_job_observation_does_not_change_recovery_state(self):
        self.register()
        before = self.ledger.snapshot(self.operation)
        self.ledger.record_job_observation(
            self.operation, str(uuid.uuid4())
        )
        self.assertEqual(
            self.ledger.snapshot(self.operation), before
        )

    def test_no_success_state_in_database_contract(self):
        self.register()
        with self.assertRaises(sqlite3.IntegrityError):
            with closing(self.ledger._connect()) as db, db:
                db.execute(
                    """
                    UPDATE operations
                    SET state = 'RECOVERY_VERIFIED'
                    WHERE operation_id = ?
                    """,
                    (self.operation,),
                )


    def test_first_job_creation_reservation_is_durable(self):
        self.register()
        request = str(uuid.uuid4())
        self.assertTrue(
            self.ledger.reserve_job_creation(
                self.operation, request, 1000
            )
        )
        reopened = RecoveryLedger(self.path)
        self.assertFalse(
            reopened.reserve_job_creation(
                self.operation, str(uuid.uuid4()), 1001
            )
        )

    def test_duplicate_job_creation_reservation_denied(self):
        self.register()
        request = str(uuid.uuid4())
        self.assertTrue(
            self.ledger.reserve_job_creation(
                self.operation, request, 1000
            )
        )
        self.assertFalse(
            self.ledger.reserve_job_creation(
                self.operation, request, 1001
            )
        )

    def test_expired_recovery_lease_does_not_unlock_creation(self):
        self.register()
        request = str(uuid.uuid4())
        self.assertTrue(
            self.ledger.reserve_job_creation(
                self.operation, request, 1000
            )
        )
        self.ledger.claim_recovery(self.operation, 1000, 30)
        self.assertIsNotNone(
            self.ledger.claim_recovery(self.operation, 1030)
        )
        self.assertFalse(
            self.ledger.reserve_job_creation(
                self.operation, str(uuid.uuid4()), 1031
            )
        )

    def test_unknown_operation_cannot_reserve_job_creation(self):
        self.assertFalse(
            self.ledger.reserve_job_creation(
                self.operation, str(uuid.uuid4()), 1000
            )
        )


if __name__ == "__main__":
    unittest.main()