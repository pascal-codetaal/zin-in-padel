import type { Route } from "./+types/webhooks.twilio.whatsapp";
import { handleIncomingMessage } from "~/lib/whatsapp-bot.server";
import { parseTwilioForm, twimlResponse } from "~/lib/twilio.server";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const form = await request.formData();
  const inbound = parseTwilioForm(form);
  const twiml = await handleIncomingMessage(inbound);

  return twimlResponse(twiml);
}
