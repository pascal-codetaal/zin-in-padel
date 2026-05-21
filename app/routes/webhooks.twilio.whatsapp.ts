import type { Route } from "./+types/webhooks.twilio.whatsapp";
import { handleIncomingMessage } from "~/lib/whatsapp-bot.server";
import {
  messagingReply,
  parseTwilioForm,
  twimlResponse,
} from "~/lib/twilio.server";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const form = await request.formData();
  const inbound = parseTwilioForm(form);
  const appOrigin = new URL(request.url).origin;
  const reply = await handleIncomingMessage(inbound, { appOrigin });

  return twimlResponse(messagingReply(reply));
}
