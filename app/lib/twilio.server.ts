export type TwilioInboundMessage = {
  from: string;
  body: string;
  profileName: string;
  waId: string;
  /** Twilio MessageSid (SM…) from the inbound webhook; required for typing indicators. */
  messageSid?: string;
  /** Parsed from an inbound vCard (WhatsApp “share contact”). */
  sharedContact?: { name: string; phone: string };
  /** vCard attachment present but could not be parsed into name + phone. */
  vcardUnreadable?: boolean;
};

export function parseTwilioForm(
  form: FormData | Record<string, string>,
): TwilioInboundMessage {
  const get = (key: string) =>
    (form instanceof FormData
      ? form.get(key)?.toString()
      : form[key]) ?? "";

  const messageSid = get("MessageSid");
  return {
    from: get("From"),
    body: get("Body"),
    profileName: get("ProfileName"),
    waId: get("WaId"),
    messageSid: messageSid || undefined,
  };
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

/** Ack inbound without sending a message (use when replying via REST API). */
export function emptyMessagingReply(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;
}

export function messagingReply(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`;
}
