import assert from "node:assert/strict";
import {
  inviteMicrosoftGraphStaffMember
} from "../../src/services/staff/microsoftGraphStaffInvitation";

async function run(): Promise<void> {
  const requests: Array<{
    url: string;
    init?: RequestInit;
  }> = [];

  const result = await inviteMicrosoftGraphStaffMember(
    {
      displayName: "Invited Ministry Staff",
      email: "invitee@example.org"
    },
    {
      tenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
      clientId: "11d880a9-6bf7-48fa-97f8-24b810cfd5e8",
      clientSecret: "server-only-secret",
      inviteRedirectUrl: "https://white-pond-0b5b9d90f.7.azurestaticapps.net/"
    },
    async (url, init) => {
      requests.push({ url, init });

      if (requests.length === 1) {
        return {
          ok: true,
          json: async () => ({ access_token: "graph-token" })
        };
      }

      return {
        ok: true,
        json: async () => ({
          invitedUser: {
            id: "c1717a19-c719-4ed2-8b72-e013800095de"
          }
        })
      };
    }
  );

  assert.deepEqual(result, {
    entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
    entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
  });
  assert.equal(requests.length, 2);
  assert.match(requests[0]?.url ?? "", /oauth2\/v2\.0\/token$/);
  assert.equal(requests[1]?.url, "https://graph.microsoft.com/v1.0/invitations");
  assert.equal(
    (requests[1]?.init?.headers as Record<string, string>)?.authorization,
    "Bearer graph-token"
  );

  const inviteBody = JSON.parse(String(requests[1]?.init?.body));
  assert.equal(inviteBody.invitedUserEmailAddress, "invitee@example.org");
  assert.equal(inviteBody.invitedUserDisplayName, "Invited Ministry Staff");
  assert.equal(inviteBody.sendInvitationMessage, true);

  console.log("microsoftGraphStaffInvitation.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
