import type { Route } from "./+types/webhooks.twilio.whatsapp";
import { handleIncomingMessage } from "~/lib/whatsapp-bot.server";
import { validateTwilioWebhookSignature } from "~/lib/twilio-client.server";
import {
  getTwilioWebhookUrl,
  isTwilioConfigured,
  shouldValidateTwilioSignature,
} from "~/lib/twilio-config.server";
import {
  logTwilio,
  logTwilioError,
  logTwilioInboundForm,
  logTwilioReply,
  logTwilioWarn,
} from "~/lib/twilio-log.server";
import {
  messagingReply,
  parseTwilioForm,
  twimlResponse,
} from "~/lib/twilio.server";

export async function action({ request }: Route.ActionArgs) {
  const startedAt = Date.now();

  if (request.method !== "POST") {
    logTwilioWarn("rejected method", { method: request.method });
    return new Response("Method Not Allowed", { status: 405 });
  }

  logTwilio("webhook POST", {
    url: request.url,
    webhookUrlForSignature: getTwilioWebhookUrl(request),
    signatureValidationEnabled: shouldValidateTwilioSignature(),
  });

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    logTwilioError("failed to parse form body", error);
    return new Response("Bad Request", { status: 400 });
  }

  logTwilioInboundForm(form);

  if (shouldValidateTwilioSignature()) {
    const webhookUrl = getTwilioWebhookUrl(request);
    const valid = validateTwilioWebhookSignature(request, form, webhookUrl);
    if (!valid) {
      logTwilioWarn("signature invalid", { webhookUrl });
      return new Response("Forbidden", { status: 403 });
    }
    logTwilio("signature ok", { webhookUrl });
  } else {
    logTwilio("signature check skipped");
  }

  const inbound = parseTwilioForm(form);
  const appOrigin = new URL(request.url).origin;

  logTwilio("processing inbound", {
    waId: inbound.waId,
    from: inbound.from,
    profileName: inbound.profileName,
  });

  try {
    const reply = await handleIncomingMessage(inbound, {
      appOrigin,
      deliverReplyViaApi: false,
    });

    if (!isTwilioConfigured()) {
      logTwilioWarn(
        "TWILIO_* not set — reply stored in DB; TwiML may not deliver to WhatsApp",
      );
    }

    logTwilioReply(reply, {
      durationMs: Date.now() - startedAt,
      waId: inbound.waId,
    });

    return twimlResponse(messagingReply(reply));
  } catch (error) {
    logTwilioError("handler failed", error, {
      waId: inbound.waId,
      durationMs: Date.now() - startedAt,
    });
    return new Response("Internal Server Error", { status: 500 });
  }
}
