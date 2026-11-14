"""Offline regressions for the structured evidence consumer."""

import json
import tempfile
import unittest
import uuid
from pathlib import Path

from phase_c_recovery_ledger_v1 import RecoveryLedger
from phase_c_operation_intent_v1 import EXPECTED_SCOPE
from phase_c_github_evidence_consumer_v1 import assess_github_evidence_json


class EvidenceConsumerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.ledger = RecoveryLedger(Path(self.temp.name) / "db")
        self.operation = str(uuid.uuid4())
        self.request = str(uuid.uuid4())
        self.ledger.register(self.operation, 200)
        self.ledger.reserve_job_creation(self.operation, self.request, 100)

        self.evidence = {
            "schema": "phase-c-github-evidence-v1",
            "operationId": self.operation,
            "requestId": self.request,
            "runId": 123,
            "run": {
                "id": 123,
                "repository": {
                    "full_name": "HOPEpicenter/hope-ai-api"
                },
                "path": ".github/workflows/phase-c-protected-job-creation.yml",
                "event": "workflow_dispatch",
                "head_branch": "main",
            },
            "job": {
                "run_id": 123,
                "name": (
                    f"DISABLED operation={self.operation} "
                    f"request={self.request}"
                ),
            },
            "history": [{
                "state": "approved",
                "user": {"login": "Hope-2018"},
                "environments": [
                    {"name": "HOPE-Phase-C-Job-Creation"}
                ],
            }],
            "executionAuthorized": False,
            "trustedIssuerConnected": False,
        }

    def assess(self, evidence=None):
        payload = self.evidence if evidence is None else evidence
        return assess_github_evidence_json(
            self.ledger, self.operation, self.request,
            EXPECTED_SCOPE, json.dumps(payload)
        )

    def test_consistent_evidence_remains_nonauthorizing(self):
        self.assertEqual(
            self.assess(),
            "EVIDENCE_CONSISTENT_NOT_AUTHORIZED"
        )

    def test_operation_mismatch_denied(self):
        self.evidence["operationId"] = str(uuid.uuid4())
        self.assertEqual(
            self.assess(), "EVIDENCE_OPERATION_BINDING_MISMATCH"
        )

    def test_untrusted_authority_flag_denied(self):
        self.evidence["executionAuthorized"] = True
        self.assertEqual(
            self.assess(), "EVIDENCE_AUTHORITY_FENCE_INVALID"
        )

    def test_run_id_mismatch_denied(self):
        self.evidence["runId"] = 999
        self.assertEqual(
            self.assess(), "EVIDENCE_STRUCTURE_INVALID"
        )

    def test_rejected_approval_denied(self):
        self.evidence["history"].append({
            "state": "rejected",
            "user": {"login": "another-reviewer"},
            "environments": [
                {"name": "HOPE-Phase-C-Job-Creation"}
            ],
        })
        self.assertEqual(
            self.assess(), "PROTECTED_APPROVAL_REJECTED"
        )

    def test_wrong_durable_reservation_denied(self):
        self.ledger = RecoveryLedger(
            Path(self.temp.name) / "empty-db"
        )
        self.assertEqual(
            self.assess(), "OPERATION_NOT_REGISTERED"
        )

    def test_duplicate_json_keys_denied(self):
        payload = '{"schema":"a","schema":"b"}'
        self.assertEqual(
            assess_github_evidence_json(
                self.ledger, self.operation, self.request,
                EXPECTED_SCOPE, payload
            ),
            "EVIDENCE_JSON_INVALID"
        )


if __name__ == "__main__":
    unittest.main()
