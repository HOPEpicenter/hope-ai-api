"""Phase C role inventory reader boundary tests.

Tests never request Azure inspection.
"""

import pathlib
import re
import shutil
import subprocess
import unittest


SCRIPT = pathlib.Path(__file__).resolve().with_name(
    "Read-PhaseCRoleAssignmentInventory-v1.ps1"
)


class RoleInventoryReaderTests(unittest.TestCase):

    def test_default_disabled(self):
        pwsh = shutil.which("pwsh")
        self.assertIsNotNone(pwsh)

        result = subprocess.run(
            [
                pwsh,
                "-NoProfile",
                "-NonInteractive",
                "-File",
                str(SCRIPT),
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )

        self.assertEqual(result.returncode, 2)
        self.assertEqual(
            result.stdout.strip(),
            "ROLE_INVENTORY_INSPECTION=DEFAULT_DISABLED",
        )

    def test_exact_subscription_and_scope(self):
        text = SCRIPT.read_text(encoding="utf-8-sig")

        self.assertIn(
            "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
            text,
        )
        self.assertIn("rg-hope-ai-api-staging", text)
        self.assertIn("--subscription $ExpectedSubscription", text)
        self.assertIn("--scope $scope", text)
        self.assertIn("--all", text)

    def test_read_only_command_inventory(self):
        text = SCRIPT.read_text(encoding="utf-8-sig")

        calls = re.findall(
            r"(?m)^\s*(?:\$\w+\s*=\s*)?&\s+az\s+"
            r"([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){1,3})",
            text,
        )

        self.assertEqual(len(calls), 2)
        self.assertTrue(
            any(c.startswith("account show") for c in calls)
        )
        self.assertTrue(
            any(c.startswith("role assignment list") for c in calls)
        )

    def test_never_asserts_complete_cleanup(self):
        text = SCRIPT.read_text(encoding="utf-8-sig")

        self.assertIn(
            "FULL_TRANSACTION_CLEANUP_VERIFIED=False",
            text,
        )
        self.assertIn(
            "TEMPORARY_PERMISSIONS_REVOKED=NOT_VERIFIED",
            text,
        )
        self.assertNotIn(
            "FULL_TRANSACTION_CLEANUP_VERIFIED=True",
            text,
        )
        self.assertNotIn(
            "TEMPORARY_PERMISSIONS_REVOKED=True",
            text,
        )


if __name__ == "__main__":
    unittest.main()
