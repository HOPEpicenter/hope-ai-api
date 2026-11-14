"""Synthetic Phase C cleanup target security tests."""

import unittest
import uuid

from phase_c_cleanup_targets_v1 import (
    CleanupTargets,
    SUBSCRIPTION,
    RESOURCE_GROUP,
    assess_cleanup_targets,
)


class CleanupTargetTests(unittest.TestCase):

    def setUp(self):
        self.operation = str(uuid.uuid4())
        self.journal = str(uuid.uuid4())
        self.role = (
            f"/subscriptions/{SUBSCRIPTION}"
            f"/resourceGroups/{RESOURCE_GROUP}"
            "/providers/Microsoft.Authorization/"
            f"roleAssignments/{uuid.uuid4()}"
        )

    def assess(self, roles=None, operation=None, journal=None):
        return assess_cleanup_targets(
            CleanupTargets(
                operation if operation is not None else self.operation,
                journal if journal is not None else self.journal,
                roles if roles is not None else (self.role,),
            )
        )

    def test_exact_targets_never_prove_cleanup(self):
        result = self.assess()
        self.assertTrue(result.valid)
        self.assertFalse(result.cleanup_verified)
        self.assertEqual(
            result.code,
            "TARGET_IDENTIFIERS_VALID_UNVERIFIED",
        )

    def test_missing_assignment_inventory_denied(self):
        self.assertFalse(self.assess(roles=()).valid)

    def test_duplicate_assignment_denied(self):
        self.assertFalse(
            self.assess(roles=(self.role, self.role)).valid
        )

    def test_wrong_subscription_denied(self):
        wrong = self.role.replace(
            SUBSCRIPTION, str(uuid.uuid4())
        )
        self.assertFalse(self.assess(roles=(wrong,)).valid)

    def test_wrong_resource_group_denied(self):
        wrong = self.role.replace(
            RESOURCE_GROUP, "rg-other"
        )
        self.assertFalse(self.assess(roles=(wrong,)).valid)

    def test_invalid_operation_denied(self):
        self.assertFalse(
            self.assess(operation="*").valid
        )

    def test_invalid_journal_denied(self):
        self.assertFalse(
            self.assess(journal="UNKNOWN").valid
        )

    def test_wildcard_assignment_denied(self):
        self.assertFalse(
            self.assess(roles=("*",)).valid
        )

    def test_untrusted_mapping_denied(self):
        self.assertFalse(
            assess_cleanup_targets({
                "operation_id": self.operation,
                "journal_id": self.journal,
                "role_assignment_ids": (self.role,),
            }).valid
        )


if __name__ == "__main__":
    unittest.main()
