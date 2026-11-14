"""Focused tests for the disabled operation authorization contract."""

import unittest
import uuid

from phase_c_operation_authorization_v1 import (
    assess_operation_authorization,
)


class OperationAuthorizationTests(unittest.TestCase):

    def setUp(self):
        self.operation = str(uuid.uuid4())

    def assess(self, **overrides):
        arguments = {
            "operation_id": self.operation,
            "approved_operation_id": self.operation,
            "approval_verified": True,
            "replay_clear": True,
        }
        arguments.update(overrides)
        return assess_operation_authorization(**arguments)

    def test_default_deny(self):
        self.assertEqual(
            assess_operation_authorization(
                self.operation, self.operation
            ),
            "APPROVAL_NOT_VERIFIED",
        )

    def test_unverified_approval_denied(self):
        self.assertEqual(
            self.assess(approval_verified=False),
            "APPROVAL_NOT_VERIFIED",
        )

    def test_wrong_operation_denied(self):
        self.assertEqual(
            self.assess(approved_operation_id=str(uuid.uuid4())),
            "OPERATION_SCOPE_MISMATCH",
        )

    def test_replay_not_verified_denied(self):
        self.assertEqual(
            self.assess(replay_clear=False),
            "REPLAY_PROTECTION_NOT_VERIFIED",
        )

    def test_execution_cannot_be_enabled(self):
        self.assertEqual(
            self.assess(execution_enabled=True),
            "EXECUTION_NOT_IMPLEMENTED",
        )

    def test_claimed_approval_is_not_authority(self):
        self.assertEqual(
            self.assess(),
            "PROTECTED_AUTHORITY_NOT_CONNECTED",
        )


if __name__ == "__main__":
    unittest.main()
