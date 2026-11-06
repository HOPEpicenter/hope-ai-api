#!/usr/bin/env python3
"""Private staging-only staff-binding acceptance runner.

Read-only. No visitor contact. No sensitive output.
Credentials must come from separately approved secure custody.
"""

import http.client
import ipaddress
import os
import re
import socket
import ssl
import sys

HOST = "hope-ai-api-staging-flex.azurewebsites.net"

GUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{12}$"
)

PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(item)
    for item in (
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
    )
)


def validate_environment():
    names = (
        "HOPE_API_KEY",
        "HOPE_ENTRA_TENANT_ID",
        "HOPE_ENTRA_OBJECT_ID",
    )

    values = {}

    for name in names:
        value = os.environ.get(name, "").strip()

        if not value:
            return None

        values[name] = value

    for name in (
        "HOPE_ENTRA_TENANT_ID",
        "HOPE_ENTRA_OBJECT_ID",
    ):
        if not GUID_PATTERN.fullmatch(values[name]):
            return None

    return values


def verified_private_address():
    try:
        results = socket.getaddrinfo(
            HOST,
            443,
            family=socket.AF_INET,
            type=socket.SOCK_STREAM,
        )

        addresses = {
            ipaddress.ip_address(result[4][0])
            for result in results
        }

        if not addresses:
            return None

        for address in addresses:
            if not any(
                address in network
                for network in PRIVATE_NETWORKS
            ):
                return None

        return str(sorted(addresses)[0])

    except (OSError, ValueError):
        return None


class PinnedPrivateHTTPSConnection(http.client.HTTPSConnection):
    """TLS validates HOST while TCP connects to a checked private IP."""

    def __init__(self, host, pinned_ip, timeout=10):
        super().__init__(
            host=host,
            port=443,
            timeout=timeout,
            context=ssl.create_default_context(),
        )
        self.pinned_ip = pinned_ip

    def connect(self):
        raw_socket = socket.create_connection(
            (self.pinned_ip, 443),
            timeout=self.timeout,
        )

        try:
            self.sock = self._context.wrap_socket(
                raw_socket,
                server_hostname=self.host,
            )
        except BaseException:
            raw_socket.close()
            raise


def verify_binding(values, pinned_ip):
    tenant = values["HOPE_ENTRA_TENANT_ID"]
    object_id = values["HOPE_ENTRA_OBJECT_ID"]

    path = (
        "/api/staff-identities/entra/"
        + tenant
        + "/"
        + object_id
    )

    connection = PinnedPrivateHTTPSConnection(
        HOST,
        pinned_ip,
        timeout=10,
    )

    try:
        connection.request(
            "GET",
            path,
            headers={
                "Host": HOST,
                "x-api-key": values["HOPE_API_KEY"],
                "Connection": "close",
            },
        )

        response = connection.getresponse()

        return response.status == 200

    except (
        OSError,
        ssl.SSLError,
        http.client.HTTPException,
        ValueError,
    ):
        return False

    finally:
        connection.close()


def main():
    if len(sys.argv) != 2 or sys.argv[1] != "--execute":
        print("ACCEPTANCE_EXECUTION_AUTHORIZED=False")
        print("ACCEPTANCE_REQUEST_PERFORMED=False")
        return 2

    values = validate_environment()

    if values is None:
        print("ACCEPTANCE_INPUTS_READY=False")
        print("ACCEPTANCE_REQUEST_PERFORMED=False")
        return 2

    pinned_ip = verified_private_address()

    if pinned_ip is None:
        print("PRIVATE_DNS_VERIFIED=False")
        print("ACCEPTANCE_REQUEST_PERFORMED=False")
        return 3

    print("PRIVATE_DNS_VERIFIED=True")
    print("ACCEPTANCE_REQUEST_ATTEMPTED=True")

    passed = verify_binding(values, pinned_ip)

    print(f"STAFF_BINDING_LOOKUP_PASSED={passed}")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
