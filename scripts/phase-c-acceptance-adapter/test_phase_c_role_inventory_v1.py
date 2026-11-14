"""Synthetic ARM role-inventory security regressions."""

import unittest
import uuid

from phase_c_cleanup_targets_v1 import (
    CleanupTargets,
    SUBSCRIPTION,
    RESOURCE_GROUP,
)
from phase_c_role_inventory_v1 import assess_role_inventory


class RoleInventoryTests(unittest.TestCase):

    def setUp(self):
        self.role = (
            f"/subscriptions/{SUBSCRIPTION}"
            f"/resourceGroups/{RESOURCE_GROUP}"
            "/providers/Microsoft.Authorization/"
            f"roleAssignments/{uuid.uuid4()}"
        )
        self.targets = CleanupTargets(
            str(uuid.uuid4()),
            str(uuid.uuid4()),
            (self.role,),
        )

    def test_present_assignment_is_not_clean(self):
        result = assess_role_inventory(
            self.targets,
            {"value": [{"id": self.role}], "nextLink": None},
        )
        self.assertEqual(
            result.code,
            "TEMPORARY_ASSIGNMENT_STILL_PRESENT",
        )
        self.assertFalse(result.cleanup_verified)

    def test_empty_inventory_never_proves_revocation(self):
        result = assess_role_inventory(
            self.targets,
            {"value": [], "nextLink": None},
        )
        self.assertEqual(
            result.code,
            "ABSENCE_OBSERVED_NOT_VERIFIED",
        )
        self.assertFalse(result.cleanup_verified)

    def test_unrelated_assignment_not_proof(self):
        result = assess_role_inventory(
            self.targets,
            {"value": [{"id": "unrelated"}], "nextLink": None},
        )
        self.assertEqual(
            result.code,
            "ABSENCE_OBSERVED_NOT_VERIFIED",
        )
        self.assertFalse(result.cleanup_verified)

    def test_pagination_blocks_conclusion(self):
        result = assess_role_inventory(
            self.targets,
            {"value": [], "nextLink": "more"},
        )
        self.assertEqual(result.code, "INVENTORY_INCOMPLETE")
        self.assertFalse(result.cleanup_verified)

    def test_missing_inventory_fails_closed(self):
        for inventory in (None, {}, [], {"value": []}):
            with self.subTest(inventory=inventory):
                result = assess_role_inventory(
                    self.targets, inventory
                )
                self.assertEqual(
                    result.code, "INVENTORY_UNAVAILABLE"
                )
                self.assertFalse(result.cleanup_verified)

    def test_duplicate_records_rejected(self):
        result = assess_role_inventory(
            self.targets,
            {
                "value": [
                    {"id": self.role},
                    {"id": self.role},
                ],
                "nextLink": None,
            },
        )
        self.assertEqual(result.code, "INVENTORY_UNAVAILABLE")

    def test_invalid_targets_rejected(self):
        result = assess_role_inventory(
            None,
            {"value": [], "nextLink": None},
        )
        self.assertEqual(result.code, "INVENTORY_UNAVAILABLE")

    def test_no_input_can_assert_cleanup_verified(self):
        inventories = (
            {"value": [], "nextLink": None},
            {"value": [{"id": self.role}], "nextLink": None},
            {"value": [], "nextLink": "more"},
            None,
        )
        for inventory in inventories:
            with self.subTest(inventory=inventory):
                self.assertFalse(
                    assess_role_inventory(
                        self.targets, inventory
                    ).cleanup_verified
                )


if __name__ == "__main__":
    unittest.main()
