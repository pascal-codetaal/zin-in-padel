/**
 * Twilio Content API — create templates, submit WhatsApp approval, fetch status.
 * @see https://www.twilio.com/docs/content/content-api-resources
 */

export type TwilioWhatsAppApprovalStatus =
  | "draft"
  | "unsubmitted"
  | "received"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "unknown";

export type TwilioContentCreatePayload = {
  friendly_name: string;
  language: string;
  variables?: Record<string, string>;
  types: Record<string, unknown>;
};

export type TwilioContentCreateResult = {
  sid: string;
  friendlyName: string;
};

export type TwilioApprovalSyncResult = {
  status: TwilioWhatsAppApprovalStatus;
  rejectionReason: string | null;
  whatsappName: string | null;
};

function contentApiAuth(): { accountSid: string; authToken: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).");
  }
  return { accountSid, authToken };
}

function basicAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

export function normalizeWhatsAppApprovalStatus(
  raw: string | undefined | null,
): TwilioWhatsAppApprovalStatus {
  const value = raw?.trim().toLowerCase();
  switch (value) {
    case "draft":
    case "unsubmitted":
    case "received":
    case "pending":
    case "approved":
    case "rejected":
    case "paused":
    case "disabled":
      return value;
    default:
      return "unknown";
  }
}

export async function createTwilioContentTemplate(
  payload: TwilioContentCreatePayload,
): Promise<TwilioContentCreateResult> {
  const { accountSid, authToken } = contentApiAuth();
  const response = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(accountSid, authToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Twilio Content create failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  const sid = typeof body.sid === "string" ? body.sid : "";
  const friendlyName =
    typeof body.friendly_name === "string" ? body.friendly_name : payload.friendly_name;
  if (!sid) {
    throw new Error("Twilio Content create returned no sid.");
  }

  return { sid, friendlyName };
}

export async function submitTwilioWhatsAppApproval(input: {
  contentSid: string;
  name: string;
  category: string;
}): Promise<void> {
  const { accountSid, authToken } = contentApiAuth();
  const response = await fetch(
    `https://content.twilio.com/v1/Content/${input.contentSid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(accountSid, authToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        category: input.category,
      }),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Twilio WhatsApp approval submit failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }
}

export async function fetchTwilioWhatsAppApproval(
  contentSid: string,
): Promise<TwilioApprovalSyncResult> {
  const { accountSid, authToken } = contentApiAuth();
  const response = await fetch(
    `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`,
    {
      headers: {
        Authorization: basicAuthHeader(accountSid, authToken),
      },
    },
  );

  const body = (await response.json().catch(() => ({}))) as {
    whatsapp?: {
      status?: string;
      name?: string;
      rejection_reason?: string;
    };
  };

  if (!response.ok) {
    throw new Error(
      `Twilio approval fetch failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  const whatsapp = body.whatsapp;
  return {
    status: normalizeWhatsAppApprovalStatus(whatsapp?.status),
    rejectionReason: whatsapp?.rejection_reason?.trim() || null,
    whatsappName: whatsapp?.name?.trim() || null,
  };
}
