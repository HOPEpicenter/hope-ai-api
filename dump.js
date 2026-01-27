const { TableClient } = require("@azure/data-tables");

(async () => {
  try {
    const client = TableClient.fromConnectionString(
      process.env.AzureWebJobsStorage,
      "devVisitors",
      { allowInsecureConnection: true }
    );

    console.log("Reading entities from devVisitors...\n");

    let count = 0;
    for await (const entity of client.listEntities()) {
      count++;
      console.log("---- ENTITY ----");
      console.log(entity);
      console.log();
    }

    if (count === 0) {
      console.log("No entities found.");
    }
  } catch (err) {
    console.error("Error reading table:", err);
  }
})();
