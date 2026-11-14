"""Focused offline checks for durable operation intent binding."""

import tempfile
import unittest
import uuid
from pathlib import Path

from phase_c_recovery_ledger_v1 import RecoveryLedger
from phase_c_operation_intent_v1 import (
    EXPECTED_SCOPE,
    assess_operation_intent,
)


class OperationIntentTests(unittest.TestCase):
    def test_exact_reserved_intent_remains_unauthorized(self):
        with tempfile.TemporaryDirectory() as temp:
            ledger = RecoveryLedger(Path(temp) / "ledger.db")
            op = str(uuid.uuid4())
            request = str(uuid.uuid4())
            ledger.register(op, 200)
            self.assertTrue(
                ledger.reserve_job_creation(op, request, 100)
            )
            self.assertEqual(
                assess_operation_intent(
                    ledger, op, request, EXPECTED_SCOPE
                ),
                "TRUSTED_AUTHORITY_NOT_CONNECTED",
            )

    def test_wrong_request_is_denied(self):
        with tempfile.TemporaryDirectory() as temp:
            ledger = RecoveryLedger(Path(temp) / "ledger.db")
            op = str(uuid.uuid4())
            ledger.register(op, 200)
            ledger.reserve_job_creation(
                op, str(uuid.uuid4()), 100
            )
            self.assertEqual(
                assess_operation_intent(
                    ledger, op, str(uuid.uuid4()), EXPECTED_SCOPE
                ),
                "REQUEST_ID_MISMATCH",
            )

    def test_wrong_target_is_denied(self):
        with tempfile.TemporaryDirectory() as temp:
            ledger = RecoveryLedger(Path(temp) / "ledger.db")
            op = str(uuid.uuid4())
            request = str(uuid.uuid4())
            ledger.register(op, 200)
            ledger.reserve_job_creation(op, request, 100)
            self.assertEqual(
                assess_operation_intent(
                    ledger, op, request,
                    EXPECTED_SCOPE + "/jobs"
                ),
                "TARGET_SCOPE_MISMATCH",
            )


if __name__ == "__main__":
    unittest.main()
