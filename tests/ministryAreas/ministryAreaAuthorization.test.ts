import assert from "node:assert/strict";
import { postMinistryArea } from "../../src/functions/postMinistryArea";
import { patchMinistryArea } from "../../src/functions/patchMinistryArea";
import { getMinistryAreas } from "../../src/functions/getMinistryAreas";
import { getMinistryAreaAudit } from "../../src/functions/getMinistryAreaAudit";
import { getMinistryAreaStaffRoster } from "../../src/functions/getMinistryAreaStaffRoster";

async function run(): Promise<void> {
  const previous = process.env.HOPE_ADMIN_API_KEY;
  process.env.HOPE_ADMIN_API_KEY = "test-only-key";
  try {
    for (const handler of [postMinistryArea, patchMinistryArea,
      getMinistryAreas, getMinistryAreaAudit,
      getMinistryAreaStaffRoster]) {
      const context: any = { log: { warn() {}, error() {} } };
      await handler(context, { headers: {}, body: { displayName: "Never written" },
        params: { ministryAreaId: "area-1" } });
      assert.equal(context.res.status, 401);
    }
  } finally {
    if (previous === undefined) delete process.env.HOPE_ADMIN_API_KEY;
    else process.env.HOPE_ADMIN_API_KEY = previous;
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
