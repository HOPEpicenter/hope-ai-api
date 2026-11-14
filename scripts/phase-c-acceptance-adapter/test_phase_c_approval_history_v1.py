"""Synthetic complete-history consistency regressions."""

import tempfile
import unittest
import uuid
from pathlib import Path

from phase_c_recovery_ledger_v1 import RecoveryLedger
from phase_c_operation_intent_v1 import EXPECTED_SCOPE
from phase_c_approval_binding_v1 import (
    assess_complete_approval_history,
)


class ApprovalHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.ledger = RecoveryLedger(Path(self.temp.name) / "db")
        self.operation = str(uuid.uuid4())
        self.request = str(uuid.uuid4())

        self.ledger.register(self.operation, 200)
        self.ledger.reserve_job_creation(
            self.operation, self.request, 100
        )

        self.run = {
            "id": 123,
            "repository": {"full_name": "HOPEpicenter/hope-ai-api"},
            "path": ".github/workflows/phase-c-protected-job-creation.yml",
            "event": "workflow_dispatch",
            "head_branch": "main",
        }

        self.job = {
            "run_id": 123,
            "name": (
                f"DISABLED operation={self.operation} "
                f"request={self.request}"
            ),
        }

        self.approval = {
            "state": "approved",
            "user": {"login": "Hope-2018"},
            "environments": [
                {"name": "HOPE-Phase-C-Job-Creation"}
            ],
        }

    def assess(self, history):
        return assess_complete_approval_history(
            self.ledger,
            self.operation,
            self.request,
            EXPECTED_SCOPE,
            self.run,
            self.job,
            history,
        )

    def test_consistent_history_not_authorized(self):
        self.assertEqual(
            self.assess([self.approval]),
            "EVIDENCE_CONSISTENT_NOT_AUTHORIZED",
        )

    def test_empty_history_denied(self):
        self.assertEqual(
            self.assess([]),
            "APPROVAL_HISTORY_INVALID",
        )

    def test_rejection_denied_regardless_of_order(self):
        rejection = {
            **self.approval,
            "state": "rejected",
        }

        for records in (
            [self.approval, rejection],
            [rejection, self.approval],
        ):
            self.assertEqual(
                self.assess(records),
                "PROTECTED_APPROVAL_REJECTED",
            )

    def test_duplicate_approval_denied(self):
        self.assertEqual(
            self.assess([self.approval, dict(self.approval)]),
            "PROTECTED_APPROVAL_NOT_UNIQUE",
        )

    def test_malformed_history_denied(self):
        self.assertEqual(
            self.assess([self.approval, {"state": "approved"}]),
            "APPROVAL_HISTORY_INVALID",
        )

    def test_wrong_operation_job_denied(self):
        self.job["name"] = "DISABLED operation=wrong request=wrong"
        self.assertEqual(
            self.assess([self.approval]),
            "JOB_OPERATION_BINDING_MISMATCH",
        )


if __name__ == "__main__":
    unittest.main()
