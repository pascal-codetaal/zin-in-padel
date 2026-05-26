import { appendMessage, findUserById } from "~/lib/db.server";
import { isTwilioConfigured, isTwilioMock } from "~/lib/twilio-config.server";
import {
  sendTwilioWhatsAppMessage,
  sendTwilioWhatsAppTypingIndicator,
} from "~/lib/twilio-client.server";
import {
  logTwilio,
  logTwilioError,
  logTwilioWarn,
} from "~/lib/twilio-log.server";

/** Best-effort typing indicator; never throws (WhatsApp public beta on Twilio). */
export async function sendWhatsAppTypingIndicator(
  messageSid: string | undefined,
): Promise<void> {
  const sid = messageSid?.trim();
  if (!sid) return;

  if (isTwilioMock()) {
    logTwilio("typing indicator (mock)", { messageSid: sid });
    return;
  }

  if (!isTwilioConfigured()) {
    logTwilioWarn("typing indicator skipped — Twilio not configured", {
      messageSid: sid,
    });
    return;
  }

  try {
    await sendTwilioWhatsAppTypingIndicator(sid);
    logTwilio("typing indicator sent", { messageSid: sid });
  } catch (error) {
    logTwilioError("typing indicator failed", error, { messageSid: sid });
  }
}

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
