import unittest

from phase_c_authorization_gate_v1 import (
    DENIAL,
    assess_execution_request,
    require_execution_authorization,
    trusted_verifier_available,
)


class PhaseCAuthorizationGateTests(unittest.TestCase):

    def test_default_denied(self):
        self.assertEqual(assess_execution_request(), DENIAL)

    def test_execute_flag_cannot_authorize(self):
        self.assertEqual(
            assess_execution_request(execute=True), DENIAL
        )

    def test_self_declared_approval_cannot_authorize(self):
        self.assertEqual(
            assess_execution_request(
                execute=True,
                approval={"approved": True},
            ),
            DENIAL,
        )

    def test_environment_name_cannot_authorize(self):
        self.assertEqual(
            assess_execution_request(
                execute=True,
                environment="production",
            ),
            DENIAL,
        )

    def test_combined_inputs_cannot_authorize(self):
        self.assertEqual(
            assess_execution_request(
                execute=True,
                approval={"approved": True, "verified": True},
                environment="phase-c-acceptance",
            ),
            DENIAL,
        )

    def test_unavailable_external_verifier(self):
        self.assertFalse(trusted_verifier_available())

    def test_requirement_raises_fixed_denial(self):
        with self.assertRaisesRegex(
            PermissionError,
            "^LIVE_EXECUTION_NOT_AUTHORIZED$",
        ):
            require_execution_authorization(execute=True)

    def test_synthetic_secret_not_in_exception(self):
        secret = "SYNTHETIC_SECRET_MARKER"
        try:
            require_execution_authorization(
                approval={"token": secret},
            )
        except PermissionError as error:
            self.assertEqual(str(error), DENIAL)
            self.assertNotIn(secret, str(error))
        else:
            self.fail("Authorization must be denied")


if __name__ == "__main__":
    unittest.main()