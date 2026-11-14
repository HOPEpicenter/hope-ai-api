"""Focused regression coverage for offline approval evidence binding."""

import tempfile
import unittest
import uuid
from pathlib import Path

from phase_c_recovery_ledger_v1 import RecoveryLedger
from phase_c_operation_intent_v1 import EXPECTED_SCOPE
from phase_c_approval_binding_v1 import assess_approval_binding


class ApprovalBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.ledger = RecoveryLedger(Path(self.temp.name) / "db")
        self.op = str(uuid.uuid4())
        self.req = str(uuid.uuid4())
        self.ledger.register(self.op, 200)
        self.ledger.reserve_job_creation(self.op, self.req, 100)
        self.run = {
            "id": 123,
            "repository": {"full_name": "HOPEpicenter/hope-ai-api"},
            "path": ".github/workflows/phase-c-protected-job-creation.yml",
            "event": "workflow_dispatch",
            "head_branch": "main",
        }
        self.job = {
            "run_id": 123,
            "name": f"DISABLED operation={self.op} request={self.req}",
        }
        self.approval = {
            "state": "approved",
            "user": {"login": "Hope-2018"},
            "environments": [
                {"name": "HOPE-Phase-C-Job-Creation"}
            ],
        }

    def assess(self):
        return assess_approval_binding(
            self.ledger, self.op, self.req,
            EXPECTED_SCOPE, self.run, self.job, self.approval
        )

    def test_consistent_evidence_does_not_authorize(self):
        self.assertEqual(
            self.assess(), "EVIDENCE_CONSISTENT_NOT_AUTHORIZED"
        )

    def test_wrong_job_operation_denied(self):
        self.job["name"] = "DISABLED operation=other request=other"
        self.assertEqual(
            self.assess(), "JOB_OPERATION_BINDING_MISMATCH"
        )

    def test_wrong_approval_environment_denied(self):
        self.approval["environments"] = [{"name": "Production"}]
        self.assertEqual(
            self.assess(), "APPROVAL_BINDING_MISMATCH"
        )

    def test_wrong_workflow_denied(self):
        self.run["path"] = ".github/workflows/deploy.yml"
        self.assertEqual(
            self.assess(), "WORKFLOW_IDENTITY_MISMATCH"
        )


if __name__ == "__main__":
    unittest.main()
