import type { TwilioInboundMessage } from "~/lib/twilio.server";
import type { User } from "~/types/domain";

export function inboundFromUser(user: User, body: string): TwilioInboundMessage {
  const digits = user.waId.replace(/^whatsapp:/, "").replace(/^\+/, "");
  const from =
    user.phone && user.phone.startsWith("whatsapp:")
      ? user.phone
      : `whatsapp:+${digits}`;

  return {
    from,
    body,
    profileName: user.profileName,
    waId: digits,
  };
}
