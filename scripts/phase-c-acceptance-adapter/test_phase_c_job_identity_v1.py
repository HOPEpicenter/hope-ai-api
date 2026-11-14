"""Focused offline tests for Phase C job identity assessment."""

import unittest
import uuid

from phase_c_job_identity_v1 import (
    SUBSCRIPTION,
    RESOURCE_GROUP,
    AUTOMATION_ACCOUNT,
    RUNBOOK,
    assess_job_identity,
)


class JobIdentityTests(unittest.TestCase):

    def setUp(self):
        self.request = str(uuid.uuid4())
        self.job = {
            "id": (
                f"/subscriptions/{SUBSCRIPTION}"
                f"/resourceGroups/{RESOURCE_GROUP}"
                "/providers/Microsoft.Automation"
                f"/automationAccounts/{AUTOMATION_ACCOUNT}"
                f"/jobs/{self.request}"
            ),
            "name": self.request,
            "properties": {"runbook": {"name": RUNBOOK}},
        }

    def test_exact_match_still_unverified(self):
        self.assertEqual(
            assess_job_identity(self.request, self.job),
            "JOB_IDENTITY_MATCHED_UNVERIFIED",
        )

    def test_wrong_job_identity_rejected(self):
        self.job["id"] = self.job["id"].replace(
            AUTOMATION_ACCOUNT, "wrong-account"
        )
        self.assertEqual(
            assess_job_identity(self.request, self.job),
            "JOB_IDENTITY_MISMATCH",
        )

    def test_wrong_runbook_rejected(self):
        self.job["properties"]["runbook"]["name"] = "wrong-runbook"
        self.assertEqual(
            assess_job_identity(self.request, self.job),
            "JOB_RUNBOOK_MISMATCH",
        )

    def test_invalid_metadata_fails_closed(self):
        self.assertEqual(
            assess_job_identity(self.request, None),
            "JOB_METADATA_INVALID",
        )
        self.assertEqual(
            assess_job_identity("invalid", self.job),
            "INVALID_REQUEST_ID",
        )


if __name__ == "__main__":
    unittest.main()
