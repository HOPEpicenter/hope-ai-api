import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity, connect } from "node:tls";
import { Worker } from "node:worker_threads";

const HOST = "sthopekiad20261122.table.core.windows.net";
const TIMEOUT_MS = 10000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTITY_WORKER = `
  const { parentPort, workerData } = require("node:worker_threads");
  const { ManagedIdentityCredential } = require("@azure/identity");
  (async () => {
    try {
      const credential = new ManagedIdentityCredential(workerData, {
        retryOptions: { maxRetries: 0 }, redirectOptions: { maxRetries: 0 }
      });
      const access = await credential.getToken("https://storage.azure.com/.default");
      parentPort.postMessage({ token: access && access.token });
    } catch {
      parentPort.postMessage({ failed: true });
    }
  })();
`;

type DnsStatus = "OK" | "INVALID_RANGE" | "DNS_FAILURE" | "DNS_TIMEOUT" | "UNEXPECTED_ADDRESS";
type NetworkStatus = "OK" | "NOT_CHECKED" | "NETWORK_TIMEOUT" | "NETWORK_FAILURE" | "TLS_FAILURE";
type IdentityStatus = "OK" | "INVALID_IDENTITY_CONFIGURATION" | "IDENTITY_TIMEOUT" | "IDENTITY_FAILURE";
type ServiceStatus = "OK" | "NOT_CHECKED" | "HTTP_401" | "HTTP_403" | "HTTP_OTHER"
  | "NETWORK_TIMEOUT" | "NETWORK_FAILURE" | "TLS_FAILURE";

function ipv4(value: string): number | undefined {
  if (isIP(value) !== 4) return undefined;
  return value.split(".").reduce((number, octet) => number * 256 + Number(octet), 0);
}

function privateRange(cidr: string): { start: number; end: number } | undefined {
  const parts = cidr.split("/");
  if (parts.length !== 2 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(parts[1])) return;
  const address = ipv4(parts[0]);
  if (address === undefined) return;
  const size = 2 ** (32 - Number(parts[1]));
  const start = Math.floor(address / size) * size;
  const end = start + size - 1;
  if (start !== address) return;
  const privateBlocks = [
    [ipv4("10.0.0.0")!, ipv4("10.255.255.255")!],
    [ipv4("172.16.0.0")!, ipv4("172.31.255.255")!],
    [ipv4("192.168.0.0")!, ipv4("192.168.255.255")!]
  ];
  return privateBlocks.some(([first, last]) => start >= first && end <= last)
    ? { start, end } : undefined;
}

async function resolvePrivateAddress(expectedCidr: string): Promise<{ status: DnsStatus; address?: string }> {
  const range = privateRange(expectedCidr);
  if (!range) return { status: "INVALID_RANGE" };
  let resolver: Resolver;
  try {
    resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 1 });
  } catch {
    return { status: "DNS_FAILURE" };
  }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; resolver.cancel(); }, TIMEOUT_MS);
  try {
    const addresses = await resolver.resolve4(HOST);
    if (timedOut) return { status: "DNS_TIMEOUT" };
    if (!addresses.length || addresses.some((address) => {
      const number = ipv4(address);
      return number === undefined || number < range.start || number > range.end;
    })) return { status: "UNEXPECTED_ADDRESS" };
    return { status: "OK", address: addresses[0] };
  } catch {
    return { status: timedOut ? "DNS_TIMEOUT" : "DNS_FAILURE" };
  } finally {
    clearTimeout(timer);
  }
}

function networkError(error: unknown): "NETWORK_TIMEOUT" | "NETWORK_FAILURE" | "TLS_FAILURE" {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "ETIMEDOUT") return "NETWORK_TIMEOUT";
  if (typeof code === "string" && /^(ERR_TLS_|ERR_SSL_|ERR_OSSL_|CERT_|DEPTH_ZERO_|SELF_SIGNED_|UNABLE_TO_)/.test(code)) {
    return "TLS_FAILURE";
  }
  return "NETWORK_FAILURE";
}

function checkTls(address: string): Promise<NetworkStatus> {
  return new Promise<NetworkStatus>((resolve) => {
    const socket = connect({
      host: address, port: 443, servername: HOST, rejectUnauthorized: true,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(HOST, certificate)
    });
    const finish = (status: NetworkStatus) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(status);
    };
    const timer = setTimeout(() => finish("NETWORK_TIMEOUT"), TIMEOUT_MS);
    socket.once("secureConnect", () => finish(socket.authorized ? "OK" : "TLS_FAILURE"));
    socket.once("error", (error) => finish(networkError(error)));
  }).catch((error: unknown) => networkError(error));
}

async function acquireStorageToken(): Promise<{ status: IdentityStatus; token?: string }> {
  const clientId = process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID;
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const header = process.env.IDENTITY_HEADER;
  if (!clientId || !GUID.test(clientId) || !endpoint || !header) {
    return { status: "INVALID_IDENTITY_CONFIGURATION" };
  }
  try {
    return await new Promise((resolve) => {
      const worker = new Worker(IDENTITY_WORKER, {
        eval: true, workerData: clientId, stdout: true, stderr: true,
        env: { IDENTITY_ENDPOINT: endpoint, IDENTITY_HEADER: header }
      });
      let finished = false;
      let cleanupStarted = false;
      let cleanupResult: { status: IdentityStatus; token?: string } | undefined;
      const finish = (value: { status: IdentityStatus; token?: string }) => {
        if (finished) return;
        finished = true;
        cleanupResult = undefined;
        clearTimeout(timer);
        resolve(value);
      };
      const cleanup = (value: { status: IdentityStatus; token?: string }) => {
        if (cleanupStarted) return;
        cleanupStarted = true;
        cleanupResult = value;
        try {
          const termination = worker.terminate();
          worker.unref();
          void termination.then(
            () => finish(cleanupResult ?? { status: "IDENTITY_FAILURE" }),
            () => {
              if (finished) console.error("ISOLATED_TABLE_IDENTITY_CLEANUP_FAILED");
              else finish({ status: "IDENTITY_FAILURE" });
            }
          );
        } catch {
          worker.unref();
          if (finished) console.error("ISOLATED_TABLE_IDENTITY_CLEANUP_FAILED");
          else finish({ status: "IDENTITY_FAILURE" });
        }
      };
      const timer = setTimeout(() => {
        finish({ status: "IDENTITY_TIMEOUT" });
        cleanup({ status: "IDENTITY_TIMEOUT" });
      }, TIMEOUT_MS);
      worker.once("message", (message: unknown) => {
        const token = message && typeof message === "object" && "token" in message
          ? message.token : undefined;
        cleanup(typeof token === "string" && token
          ? { status: "OK", token } : { status: "IDENTITY_FAILURE" });
      });
      worker.on("error", () => {
        finish({ status: "IDENTITY_FAILURE" });
        cleanup({ status: "IDENTITY_FAILURE" });
      });
      worker.once("exit", () => {
        if (!cleanupStarted) finish({ status: "IDENTITY_FAILURE" });
      });
    });
  } catch {
    return { status: "IDENTITY_FAILURE" };
  }
}

function checkService(address: string, token: string): Promise<ServiceStatus> {
  return new Promise<ServiceStatus>((resolve) => {
    let finished = false;
    const finish = (status: ServiceStatus) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      req.destroy();
      resolve(status);
    };
    const req = request({
      host: address, port: 443, servername: HOST, method: "GET",
      path: "/?restype=service&comp=properties", agent: false, rejectUnauthorized: true,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(HOST, certificate),
      headers: {
        host: HOST, authorization: `Bearer ${token}`,
        "x-ms-version": "2021-12-02", "x-ms-date": new Date().toUTCString()
      }
    }, (response) => {
      const status = response.statusCode;
      response.destroy();
      finish(status === 200 ? "OK" : status === 401 ? "HTTP_401" :
        status === 403 ? "HTTP_403" : "HTTP_OTHER");
    });
    const timer = setTimeout(() => finish("NETWORK_TIMEOUT"), TIMEOUT_MS);
    req.once("error", (error) => finish(networkError(error)));
    req.end();
  }).catch((error: unknown) => networkError(error));
}

// The CIDR and configured identity are not trusted evidence or authorization.
// This private path must remain disconnected until independently reviewed.
async function runPrivateProbe(expectedCidr: string) {
  const dns = await resolvePrivateAddress(expectedCidr);
  const tls = dns.address ? await checkTls(dns.address) : "NOT_CHECKED";
  const identity = await acquireStorageToken();
  const service = dns.address && tls === "OK" && identity.token
    ? await checkService(dns.address, identity.token) : "NOT_CHECKED";
  return Object.freeze({ dns: dns.status, tls, identity: identity.status, service });
}

// No flag, caller input, test injection, or claimed approval enables this entry point.
export async function inspectIsolatedTableConnectivity() {
  return Object.freeze({ status: "AUTHORIZATION_UNAVAILABLE" as const });
}
