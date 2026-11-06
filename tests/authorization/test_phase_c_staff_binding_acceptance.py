"""Synthetic, network-free security tests for Phase C acceptance."""

import importlib.util
import ipaddress
import os
from pathlib import Path
import socket
import ssl
import sys
from unittest.mock import patch

RUNNER_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "phase-c-staff-binding-acceptance.py"
)

spec = importlib.util.spec_from_file_location(
    "phase_c_acceptance", RUNNER_PATH
)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

HOST = "hope-ai-api-staging-flex.azurewebsites.net"
TENANT = "11111111-1111-4111-8111-111111111111"
OBJECT = "22222222-2222-4222-8222-222222222222"

VALUES = {
    "HOPE_API_KEY": "synthetic-test-key-only",
    "HOPE_ENTRA_TENANT_ID": TENANT,
    "HOPE_ENTRA_OBJECT_ID": OBJECT,
}


def dns_result(address):
    return [
        (
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            (address, 443),
        )
    ]


with patch.object(
    runner.socket,
    "getaddrinfo",
    return_value=dns_result("10.86.0.25"),
):
    assert runner.verified_private_address() == "10.86.0.25"
print("PRIVATE_DNS_ACCEPTED=True")

with patch.object(
    runner.socket,
    "getaddrinfo",
    return_value=dns_result("8.8.8.8"),
):
    assert runner.verified_private_address() is None

with patch.object(
    runner.socket,
    "getaddrinfo",
    return_value=(
        dns_result("10.86.0.25") + dns_result("8.8.8.8")
    ),
):
    assert runner.verified_private_address() is None
print("PUBLIC_OR_MIXED_DNS_REJECTED=True")

assert runner.validate_environment() is None or isinstance(
    runner.validate_environment(), dict
)
with patch.dict(os.environ, {}, clear=True):
    assert runner.validate_environment() is None
print("MISSING_INPUTS_REJECTED=True")

tls_context = ssl.create_default_context()
assert tls_context.check_hostname is True
assert tls_context.verify_mode == ssl.CERT_REQUIRED

events = {}


class FakeRawSocket:
    def close(self):
        events["raw_closed"] = True


class FakeTLSContext:
    def wrap_socket(self, raw_socket, server_hostname):
        events["server_hostname"] = server_hostname
        return raw_socket


with patch.object(
    runner.ssl,
    "create_default_context",
    return_value=FakeTLSContext(),
):
    conn = runner.PinnedPrivateHTTPSConnection(
        HOST, "10.86.0.25"
    )
    with patch.object(
        runner.socket,
        "create_connection",
        return_value=FakeRawSocket(),
    ) as connect:
        conn.connect()
        connect.assert_called_once_with(
            ("10.86.0.25", 443), timeout=10
        )

assert events["server_hostname"] == HOST
print("PINNED_TCP_AND_TLS_HOSTNAME_PASSED=True")


class FakeResponse:
    def __init__(self, status):
        self.status = status


class FakeConnection:
    response_status = 200
    captured = {}

    def __init__(self, host, pinned_ip, timeout):
        assert host == HOST
        assert pinned_ip == "10.86.0.25"
        assert timeout == 10

    def request(self, method, path, headers):
        self.captured["method"] = method
        self.captured["path"] = path
        self.captured["headers"] = headers

    def getresponse(self):
        return FakeResponse(self.response_status)

    def close(self):
        self.captured["closed"] = True


with patch.object(
    runner,
    "PinnedPrivateHTTPSConnection",
    FakeConnection,
):
    assert runner.verify_binding(VALUES, "10.86.0.25")
    assert FakeConnection.captured["method"] == "GET"
    assert FakeConnection.captured["path"] == (
        f"/api/staff-identities/entra/{TENANT}/{OBJECT}"
    )
    assert FakeConnection.captured["headers"]["Host"] == HOST
    assert FakeConnection.captured["headers"]["x-api-key"] == (
        VALUES["HOPE_API_KEY"]
    )
    assert FakeConnection.captured["closed"]

    FakeConnection.response_status = 302
    assert not runner.verify_binding(VALUES, "10.86.0.25")

    FakeConnection.response_status = 403
    assert not runner.verify_binding(VALUES, "10.86.0.25")

print("READ_ONLY_GET_AND_API_KEY_HEADER_PASSED=True")
print("REDIRECT_AND_AUTH_FAILURE_REJECTED=True")
print("SYNTHETIC_HTTPS_SECURITY_TESTS_PASSED=True")
