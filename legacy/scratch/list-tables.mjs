import { TableServiceClient } from "@azure/data-tables";

async function main() {
  const client = TableServiceClient.fromConnectionString(
    "UseDevelopmentStorage=true",
    { allowInsecureConnection: true }
  );

  for await (const table of client.listTables()) {
    console.log("TABLE:", table.name);
  }
}

main();
