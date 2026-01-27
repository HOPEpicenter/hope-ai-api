import { TableClient } from "@azure/data-tables";

async function main() {
  const client = TableClient.fromConnectionString(
    "UseDevelopmentStorage=true",
    "visitors",
    { allowInsecureConnection: true }
  );

  try {
    await client.createTable();
    console.log("Table created.");
  } catch (err) {
    console.log("Error:", err.message);
  }
}

main();
