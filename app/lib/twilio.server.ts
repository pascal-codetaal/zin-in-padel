export type TwilioInboundMessage = {
  from: string;
  body: string;
  profileName: string;
  waId: string;
};

export function parseTwilioForm(
  form: FormData | Record<string, string>,
): TwilioInboundMessage {
  const get = (key: string) =>
    (form instanceof FormData
      ? form.get(key)?.toString()
      : form[key]) ?? "";

  return {
    from: get("From"),
    body: get("Body"),
    profileName: get("ProfileName"),
    waId: get("WaId"),
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
