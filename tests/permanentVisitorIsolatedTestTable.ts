import { TableClient } from "@azure/data-tables";

// Test-only factory: refuse default/shared storage and all non-loopback endpoints.
export function createIsolatedVisitorTestTable(name: string): TableClient {
  const connection = process.env.HOPE_VISITOR_133_CONNECTION;
  const port = process.env.HOPE_VISITOR_133_PORT;
  if (process.env.HOPE_VISITOR_57_LOCAL_ACCEPTANCE !== "true" ||
      !connection || !port || !/^[1-9][0-9]{0,4}$/.test(port) ||
      Number(port) > 65535 || port === "10002") {
    throw new Error("Explicit isolated visitor test storage required");
  }
  const account = "hopevisitor133";
  const endpoint = `http://127.0.0.1:${port}/${account}`;
  const fields = connection.split(";");
  if (fields.length !== 6 || fields[0] !== "DefaultEndpointsProtocol=http" ||
      fields[1] !== `AccountName=${account}` ||
      !/^AccountKey=[A-Za-z0-9+/]{86}==$/.test(fields[2]) ||
      fields[3] !== `TableEndpoint=${endpoint}` ||
      fields[4] !== `BlobEndpoint=${endpoint}` ||
      fields[5] !== `QueueEndpoint=${endpoint}` ||
      process.env.AZURITE_ACCOUNTS !== `${account}:${fields[2].slice(11)}` ||
      process.env.STORAGE_CONNECTION_STRING !== connection ||
      process.env.AzureWebJobsStorage !== connection) {
    throw new Error("Invalid isolated visitor test storage configuration");
  }
  const client = TableClient.fromConnectionString(connection, name, {
    allowInsecureConnection: true
  });
  const url = new URL(client.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
      url.port !== port || url.pathname.replace(/\/$/, "") !== `/${account}`) {
    throw new Error("Unexpected isolated visitor test storage endpoint");
  }
  return client;
}
