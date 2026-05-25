import { appendMessage, findUserById } from "~/lib/db.server";
import { isTwilioConfigured } from "~/lib/twilio-config.server";
import { sendTwilioWhatsAppMessage } from "~/lib/twilio-client.server";
import { logTwilio, logTwilioWarn } from "~/lib/twilio-log.server";

export type SendWhatsAppOptions = {
  /**
   * Send via Twilio REST API. Use false when the reply is returned as TwiML
   * from the inbound webhook (avoids duplicate messages).
   */
  deliverViaApi?: boolean;
};

export async function sendWhatsAppMessage(
  userId: string,
  body: string,
  options: SendWhatsAppOptions = {},
): Promise<void> {
  await appendMessage(userId, body, "out");

  if (options.deliverViaApi !== true || !body.length) {
    return;
  }

  if (!isTwilioConfigured()) {
    logTwilioWarn("outbound API skipped — Twilio not configured", { userId });
    return;
  }

  const user = await findUserById(userId);
  if (!user?.phone) {
    logTwilioWarn("outbound API skipped — no phone on user", { userId });
    return;
  }

  logTwilio("outbound API send", {
    userId,
    to: user.phone,
    bodyLength: body.length,
  });

  await sendTwilioWhatsAppMessage(user.phone, body);

  logTwilio("outbound API sent", { userId, to: user.phone });
}
