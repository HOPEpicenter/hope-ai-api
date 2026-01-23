import type { TableClient } from "@azure/data-tables";
import { makeTableClient } from "../../shared/storage/makeTableClient";

const VISITORS_TABLE = process.env.VISITORS_TABLE || "devVisitors";

function describeTableEndpoint(cs: string | undefined): string {
  if (!cs) return "<missing>";
  const m = cs.match(/TableEndpoint=([^;]+);/i);
  if (m && m[1]) return m[1];
  const acct = (cs.match(/AccountName=([^;]+);/i) || [])[1];
  return acct ? ("<no TableEndpoint; AccountName=" + acct + ">") : "<unknown>";
}

/**
 * Create a TableClient for Visitors table.
 * Uses STORAGE_CONNECTION_STRING (preferred) or AzureWebJobsStorage (fallback).
 */
export function getVisitorsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

  // Safe debug line: prints only endpoint, never keys/signatures
  console.log("[VisitorsTable] TableEndpoint=" + describeTableEndpoint(conn));

  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING or AzureWebJobsStorage for Table Storage.");
  }

  return makeTableClient(conn, VISITORS_TABLE);
}
