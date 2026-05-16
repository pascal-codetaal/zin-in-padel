export type TwilioInboundMessage = {
  from: string;
  body: string;
  profileName: string;
  waId: string;
};

export function parseTwilioForm(form: FormData): TwilioInboundMessage {
  return {
    from: form.get("From")?.toString() ?? "",
    body: form.get("Body")?.toString() ?? "",
    profileName: form.get("ProfileName")?.toString() ?? "",
    waId: form.get("WaId")?.toString() ?? "",
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
