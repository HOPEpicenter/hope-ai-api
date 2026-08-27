import { normalizeEntraStaffBinding } from "../../domain/staff/projectStaffDirectory";
import type {
  MicrosoftStaffInvitation
} from "./createStaffInvitation";

type FetchResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type FetchImplementation = (
  input: string,
  init?: RequestInit
) => Promise<FetchResponse>;

export type MicrosoftGraphInvitationSettings = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  inviteRedirectUrl: string;
};

function requiredSetting(value: unknown, name: string): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`Server missing ${name}`);
  }

  return normalized;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validRedirectUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("HOPE_ENTRA_INVITATION_REDIRECT_URL must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("HOPE_ENTRA_INVITATION_REDIRECT_URL must use HTTPS");
  }

  return parsed.toString();
}

export function readMicrosoftGraphInvitationSettings(
  environment: NodeJS.ProcessEnv = process.env
): MicrosoftGraphInvitationSettings {
  return {
    tenantId: requiredSetting(
      environment.HOPE_ENTRA_INVITATION_TENANT_ID,
      "HOPE_ENTRA_INVITATION_TENANT_ID"
    ),
    clientId: requiredSetting(
      environment.HOPE_ENTRA_INVITATION_CLIENT_ID,
      "HOPE_ENTRA_INVITATION_CLIENT_ID"
    ),
    clientSecret: requiredSetting(
      environment.HOPE_ENTRA_INVITATION_CLIENT_SECRET,
      "HOPE_ENTRA_INVITATION_CLIENT_SECRET"
    ),
    inviteRedirectUrl: validRedirectUrl(requiredSetting(
      environment.HOPE_ENTRA_INVITATION_REDIRECT_URL,
      "HOPE_ENTRA_INVITATION_REDIRECT_URL"
    ))
  };
}

export async function inviteMicrosoftGraphStaffMember(
  input: {
    displayName: string;
    email: string;
  },
  settings = readMicrosoftGraphInvitationSettings(),
  fetchImplementation: FetchImplementation = fetch
): Promise<MicrosoftStaffInvitation> {
  const tokenResponse = await fetchImplementation(
    `https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default"
      }).toString()
    }
  );

  const tokenBody = objectValue(await tokenResponse.json());
  const accessToken = readString(tokenBody.access_token);

  if (!tokenResponse.ok || !accessToken) {
    throw new Error("Microsoft Graph token request failed");
  }

  const invitationResponse = await fetchImplementation(
    "https://graph.microsoft.com/v1.0/invitations",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        invitedUserEmailAddress: input.email,
        invitedUserDisplayName: input.displayName,
        inviteRedirectUrl: settings.inviteRedirectUrl,
        sendInvitationMessage: true
      })
    }
  );

  const invitationBody = objectValue(await invitationResponse.json());
  const invitedUser = objectValue(invitationBody.invitedUser);
  const binding = normalizeEntraStaffBinding(
    settings.tenantId,
    readString(invitedUser.id)
  );

  if (!invitationResponse.ok || !binding) {
    throw new Error("Microsoft Graph invitation request failed");
  }

  return binding;
}
