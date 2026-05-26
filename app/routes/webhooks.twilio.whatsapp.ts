import type { Route } from "./+types/webhooks.twilio.whatsapp";
import { handleIncomingMessage } from "~/lib/whatsapp-bot.server";
import {
  isTwilioAccountSidPlausible,
  twilioParamsFromBody,
  validateTwilioWebhookSignature,
} from "~/lib/twilio-client.server";
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
import { enrichInboundWithSharedContact } from "~/lib/twilio-inbound-media.server";
import {
  emptyMessagingReply,
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

  let body: string;
  try {
    body = await request.text();
  } catch (error) {
    logTwilioError("failed to read body", error);
    return new Response("Bad Request", { status: 400 });
  }

  const params = twilioParamsFromBody(body);
  logTwilioInboundForm(params);

  if (shouldValidateTwilioSignature()) {
    const webhookUrl = getTwilioWebhookUrl(request);
    const valid = validateTwilioWebhookSignature(request, params, webhookUrl);
    if (!valid) {
      const configuredSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
      logTwilioWarn("signature invalid", {
        webhookUrl,
        accountSidFromTwilio: params.AccountSid ?? null,
        configuredAccountSidPrefix: configuredSid.slice(0, 6) || "(unset)",
        hint:
          !isTwilioAccountSidPlausible()
            ? "TWILIO_ACCOUNT_SID must be AC… (Account SID), not SK… (API key). TWILIO_AUTH_TOKEN must be the Primary Auth Token from Twilio Console → Account → API keys & tokens → Auth token — not the API key secret."
            : "Check TWILIO_AUTH_TOKEN on Vercel matches the Primary Auth Token for this account (rotate in Twilio if unsure).",
      });
      return new Response("Forbidden", { status: 403 });
    }
    logTwilio("signature ok", { webhookUrl });
  } else {
    logTwilio("signature check skipped");
  }

  let inbound = parseTwilioForm(params);
  inbound = await enrichInboundWithSharedContact(inbound, params);
  const appOrigin = new URL(request.url).origin;

  logTwilio("processing inbound", {
    waId: inbound.waId,
    from: inbound.from,
    profileName: inbound.profileName,
    sharedContacts: inbound.sharedContacts?.length ?? 0,
    numMedia: params.NumMedia ?? "0",
  });

  try {
    const reply = await handleIncomingMessage(inbound, {
      appOrigin,
      deliverReplyViaApi: true,
    });

    if (!isTwilioConfigured()) {
      logTwilioWarn(
        "TWILIO_* not set — reply stored in DB only; WhatsApp will not receive it",
      );
    }

    logTwilioReply(reply, {
      durationMs: Date.now() - startedAt,
      waId: inbound.waId,
      via: "api",
    });

    // Empty TwiML ack: reply is sent via REST API so slow agent runs (>15s) still deliver.
    return twimlResponse(emptyMessagingReply());
  } catch (error) {
    logTwilioError("handler failed", error, {
      waId: inbound.waId,
      durationMs: Date.now() - startedAt,
    });
    return new Response("Internal Server Error", { status: 500 });
  }
}
