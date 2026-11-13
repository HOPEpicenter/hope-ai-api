import contextlib
import importlib.util
import io
import pathlib
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).with_name(
    "phase_c_acceptance_adapter_v1.py"
)

spec = importlib.util.spec_from_file_location(
    "phase_c_acceptance_adapter_v1", SOURCE
)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class PhaseCAcceptanceAdapterTests(unittest.TestCase):

    def test_exact_http_200_passes(self):
        self.assertEqual(
            adapter.classify_output(["HTTP_STATUS=200"]),
            "ACCEPTANCE_PASSED"
        )

    def test_redirect_does_not_pass(self):
        self.assertEqual(
            adapter.classify_output(["HTTP_STATUS=302"]),
            "ACCEPTANCE_FAILED"
        )

    def test_authorization_failure_does_not_pass(self):
        self.assertEqual(
            adapter.classify_output(["HTTP_STATUS=403"]),
            "ACCEPTANCE_FAILED"
        )

    def test_unavailable_does_not_pass(self):
        self.assertEqual(
            adapter.classify_output(["HTTP_STATUS=UNAVAILABLE"]),
            "ACCEPTANCE_FAILED"
        )

    def test_http_200_with_failure_does_not_pass(self):
        self.assertEqual(
            adapter.classify_output([
                "HTTP_STATUS=200",
                "FAILURE_CATEGORY=AUTHORIZATION"
            ]),
            "ACCEPTANCE_FAILED"
        )

    def test_secret_marker_rejected(self):
        self.assertEqual(
            adapter.classify_output([
                "HTTP_STATUS=200",
                "API_KEY=TEST_SECRET"
            ]),
            "INVALID_EVIDENCE"
        )

    def test_multiline_rejected(self):
        self.assertEqual(
            adapter.classify_output([
                "HTTP_STATUS=200\nSTAFF_RECORD=TEST"
            ]),
            "INVALID_EVIDENCE"
        )

    def test_duplicate_status_rejected(self):
        self.assertEqual(
            adapter.classify_output([
                "HTTP_STATUS=200",
                "HTTP_STATUS=200"
            ]),
            "INVALID_EVIDENCE"
        )

    def test_exception_message_not_returned(self):
        result = adapter.classify_exception(
            RuntimeError("SYNTHETIC_SECRET_MARKER")
        )
        self.assertEqual(result, "EXECUTION_FAILURE")
        self.assertNotIn("SYNTHETIC_SECRET", result)

    def test_live_execution_denied(self):
        self.assertEqual(
            adapter.execute_live(),
            "LIVE_EXECUTION_NOT_AUTHORIZED"
        )

    def test_cli_default_disabled(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = adapter.main([])
        self.assertEqual(code, 2)
        self.assertEqual(
            output.getvalue().strip(),
            "FAILURE_CATEGORY=DEFAULT_DISABLED"
        )

    def test_cli_execute_denied(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = adapter.main(["--execute"])
        self.assertEqual(code, 2)
        self.assertEqual(
            output.getvalue().strip(),
            "FAILURE_CATEGORY=LIVE_EXECUTION_NOT_AUTHORIZED"
        )



    def test_execute_live_consults_gate(self):
        with patch.object(
            adapter, "assess_execution_request",
            return_value="LIVE_EXECUTION_NOT_AUTHORIZED",
        ) as gate:
            result = adapter.execute_live()

        gate.assert_called_once_with(execute=True)
        self.assertEqual(result, "LIVE_EXECUTION_NOT_AUTHORIZED")

    def test_cli_execute_consults_gate(self):
        output = io.StringIO()

        with patch.object(
            adapter, "assess_execution_request",
            return_value="LIVE_EXECUTION_NOT_AUTHORIZED",
        ) as gate:
            with contextlib.redirect_stdout(output):
                code = adapter.main(["--execute"])

        gate.assert_called_once_with(execute=True)
        self.assertEqual(code, 2)
        self.assertEqual(
            output.getvalue().strip(),
            "FAILURE_CATEGORY=LIVE_EXECUTION_NOT_AUTHORIZED",
        )

    def test_default_cli_does_not_request_authorization(self):
        output = io.StringIO()

        with patch.object(
            adapter, "assess_execution_request",
        ) as gate:
            with contextlib.redirect_stdout(output):
                code = adapter.main([])

        gate.assert_not_called()
        self.assertEqual(code, 2)
        self.assertEqual(
            output.getvalue().strip(),
            "FAILURE_CATEGORY=DEFAULT_DISABLED",
        )

if __name__ == "__main__":
    unittest.main()