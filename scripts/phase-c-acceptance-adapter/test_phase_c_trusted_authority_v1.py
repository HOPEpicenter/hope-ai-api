"""Fail-closed tests for the disabled trusted-authority contract."""

import unittest

from phase_c_trusted_authority_v1 import (
    DENIAL,
    OperationAuthorityScope,
    assess_trusted_operation_authority,
    trusted_operation_verifier_available,
)


class TrustedAuthorityTests(unittest.TestCase):

    def test_default_denied(self):
        self.assertEqual(
            assess_trusted_operation_authority(), DENIAL
        )

    def test_claimed_approval_denied(self):
        self.assertEqual(
            assess_trusted_operation_authority(
                evidence={"approved": True, "verified": True}
            ),
            DENIAL,
        )

    def test_complete_caller_scope_denied(self):
        scope = OperationAuthorityScope(
            operation_id="synthetic-operation",
            resource_scope="synthetic-resource",
            runbook_name="synthetic-runbook",
            request_id="synthetic-request",
            expires_utc=9999999999,
            approval_provenance="synthetic-approval",
        )
        self.assertEqual(
            assess_trusted_operation_authority(
                scope=scope,
                evidence={"issuer": "trusted"},
                execution_enabled=True,
            ),
            DENIAL,
        )

    def test_verifier_unavailable(self):
        self.assertFalse(trusted_operation_verifier_available())


if __name__ == "__main__":
    unittest.main()
